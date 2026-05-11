// snirf.js

(function initSnirfApi(globalScope) {
  "use strict";

  function parseSnirfArrayBuffer(arrayBuffer, options) {
    if (!globalScope.hdf5 || typeof globalScope.hdf5.File !== "function") {
      throw new Error("SNIRF parser dependency missing: window.hdf5.File is not available.");
    }
    if (!isArrayBufferLike(arrayBuffer)) {
      throw new Error("SNIRF parse expected an ArrayBuffer.");
    }

    const fileName = options && options.name ? String(options.name) : "dataset.snirf";
    const file = new globalScope.hdf5.File(arrayBuffer, fileName);

    const nirsPath = resolveIndexedChildPath(file, "", "nirs");
    const dataPath = resolveIndexedChildPath(file, nirsPath, "data");
    const probePath = joinPath(nirsPath, "probe");

    const dataMatrix = readNumericMatrix(file, joinPath(dataPath, "dataTimeSeries"), "dataTimeSeries");
    const timeInfo = parseTimeInfo(file, joinPath(dataPath, "time"), dataMatrix.rows);
    const measurementEntries = readMeasurementEntries(file, dataPath);
    if (!measurementEntries.length) {
      throw new Error("SNIRF data group has no measurement list entries.");
    }

    const measurementByColumn = measurementEntries.filter(entry =>
      Number.isInteger(entry.columnIndex)
      && entry.columnIndex >= 0
      && entry.columnIndex < dataMatrix.columns
      && Number.isFinite(entry.sourceIndex)
      && Number.isFinite(entry.detectorIndex)
      && Number.isFinite(entry.wavelengthIndex)
    );
    if (!measurementByColumn.length) {
      throw new Error("SNIRF measurement list entries do not map to valid dataTimeSeries columns.");
    }

    const intensityCandidates = measurementByColumn.filter(entry =>
      !Number.isFinite(entry.dataType) || Math.round(entry.dataType) === 1
    );
    const activeMeasurements = intensityCandidates.length ? intensityCandidates : measurementByColumn;

    const probeWavelengths = readNumericVectorOptional(file, joinPath(probePath, "wavelengths"));
    const selectedWavelengths = chooseWavelengthPair(activeMeasurements, probeWavelengths);

    const channelBuild = buildChannelMap(activeMeasurements, selectedWavelengths, dataMatrix.columns);
    if (!channelBuild.channels.length) {
      throw new Error("No source-detector pairs had both selected wavelengths in SNIRF measurement list.");
    }

    const wlMatrices = buildWavelengthMatrices(dataMatrix, channelBuild.channels);
    const channelDistancesMm = buildChannelDistances(file, probePath, channelBuild.channels);
    const events = readSnirfEvents(file, nirsPath, timeInfo.startTimeSeconds, timeInfo.samplingRate);

    return {
      samplingRate: timeInfo.samplingRate,
      wavelengthsNm: [selectedWavelengths.wl1Nm, selectedWavelengths.wl2Nm],
      wl1: wlMatrices.wl1,
      wl2: wlMatrices.wl2,
      events,
      channelLabels: channelBuild.channels.map(channel => "S" + channel.sourceIndex + " D" + channel.detectorIndex),
      channelLabelSource: "snirf measurementList",
      channelDistancesMm,
      meta: {
        nirsPath,
        dataPath,
        totalColumns: dataMatrix.columns,
        mappedColumns: activeMeasurements.length,
        pairedChannels: channelBuild.channels.length,
        selectedWavelengthIndices: [selectedWavelengths.wl1Index, selectedWavelengths.wl2Index]
      }
    };
  }

  function resolveIndexedChildPath(file, parentPath, prefix) {
    const keys = listGroupKeys(file, parentPath);
    const lowerPrefix = String(prefix || "").toLowerCase();
    const candidates = keys
      .filter(key => {
        const lower = String(key).toLowerCase();
        return lower === lowerPrefix || new RegExp("^" + escapeRegExp(lowerPrefix) + "\\d+$").test(lower);
      })
      .sort((a, b) => compareIndexedNames(a, b, lowerPrefix));

    if (!candidates.length) {
      const parentLabel = parentPath || "/";
      throw new Error("Missing required SNIRF group '" + prefix + "' under " + parentLabel + ".");
    }
    return joinPath(parentPath, candidates[0]);
  }

  function compareIndexedNames(a, b, lowerPrefix) {
    const aLower = String(a).toLowerCase();
    const bLower = String(b).toLowerCase();
    if (aLower === lowerPrefix && bLower !== lowerPrefix) return -1;
    if (bLower === lowerPrefix && aLower !== lowerPrefix) return 1;
    const aIndex = extractIndexSuffix(aLower, lowerPrefix);
    const bIndex = extractIndexSuffix(bLower, lowerPrefix);
    if (aIndex === null && bIndex === null) return aLower.localeCompare(bLower);
    if (aIndex === null) return -1;
    if (bIndex === null) return 1;
    return aIndex - bIndex;
  }

  function extractIndexSuffix(name, prefix) {
    const match = String(name).match(new RegExp("^" + escapeRegExp(prefix) + "(\\d+)$"));
    return match ? Number(match[1]) : null;
  }

  function escapeRegExp(input) {
    return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function isArrayBufferLike(value) {
    if (!value) return false;
    if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return true;
    return typeof value.byteLength === "number" && typeof value.slice === "function";
  }

  function joinPath(parentPath, childName) {
    if (!parentPath) return String(childName);
    return String(parentPath) + "/" + String(childName);
  }

  function listGroupKeys(file, groupPath) {
    const node = groupPath ? file.get(groupPath) : file;
    const raw = node && typeof node.keys === "function" ? node.keys() : (node ? node.keys : []);
    const keys = Array.isArray(raw) ? raw : Array.from(raw || []);
    return keys.map(value => String(value));
  }

  function readMeasurementEntries(file, dataPath) {
    const keys = listGroupKeys(file, dataPath);
    const grouped = keys.filter(key => /^measurementList\d+$/i.test(key));
    if (grouped.length) return readGroupedMeasurementEntries(file, dataPath, grouped);
    if (keys.some(key => /^measurementLists$/i.test(key))) return readVectorizedMeasurementEntries(file, dataPath);
    return [];
  }

  function readGroupedMeasurementEntries(file, dataPath, measurementKeys) {
    const ordered = measurementKeys
      .map(key => ({ key, index: extractIndexSuffix(key.toLowerCase(), "measurementlist") }))
      .filter(item => Number.isFinite(item.index) && item.index > 0)
      .sort((a, b) => a.index - b.index);

    const out = [];
    ordered.forEach(item => {
      const base = joinPath(dataPath, item.key);
      out.push({
        columnIndex: item.index - 1,
        sourceIndex: readFirstNumberOptional(file, joinPath(base, "sourceIndex")),
        detectorIndex: readFirstNumberOptional(file, joinPath(base, "detectorIndex")),
        wavelengthIndex: readFirstNumberOptional(file, joinPath(base, "wavelengthIndex")),
        dataType: readFirstNumberOptional(file, joinPath(base, "dataType")),
        dataTypeIndex: readFirstNumberOptional(file, joinPath(base, "dataTypeIndex"))
      });
    });
    return out;
  }

  function readVectorizedMeasurementEntries(file, dataPath) {
    const base = joinPath(dataPath, "measurementLists");
    const sourceIndex = readNumericVector(file, joinPath(base, "sourceIndex"));
    const detectorIndex = readNumericVector(file, joinPath(base, "detectorIndex"));
    const wavelengthIndex = readNumericVector(file, joinPath(base, "wavelengthIndex"));
    const dataType = readNumericVectorOptional(file, joinPath(base, "dataType"));
    const dataTypeIndex = readNumericVectorOptional(file, joinPath(base, "dataTypeIndex"));
    const count = Math.min(sourceIndex.length, detectorIndex.length, wavelengthIndex.length);
    const out = [];
    for (let idx = 0; idx < count; idx += 1) {
      out.push({
        columnIndex: idx,
        sourceIndex: sourceIndex[idx],
        detectorIndex: detectorIndex[idx],
        wavelengthIndex: wavelengthIndex[idx],
        dataType: dataType.length > idx ? dataType[idx] : null,
        dataTypeIndex: dataTypeIndex.length > idx ? dataTypeIndex[idx] : null
      });
    }
    return out;
  }

  function chooseWavelengthPair(measurements, probeWavelengths) {
    const wavelengthIndexSet = new Set();
    measurements.forEach(entry => {
      const index = Number(entry.wavelengthIndex);
      if (Number.isFinite(index) && index > 0) wavelengthIndexSet.add(Math.round(index));
    });
    const wavelengthIndices = Array.from(wavelengthIndexSet);
    if (wavelengthIndices.length < 2) {
      throw new Error("SNIRF dataset needs at least two wavelengths to map wl1/wl2.");
    }

    const wavelengthCandidates = wavelengthIndices.map(index => {
      const probeValue = probeWavelengths.length >= index ? probeWavelengths[index - 1] : null;
      const nominalNm = Number.isFinite(probeValue) ? Number(probeValue) : Number(index);
      return { index, nominalNm };
    });
    wavelengthCandidates.sort((a, b) => {
      if (a.nominalNm !== b.nominalNm) return a.nominalNm - b.nominalNm;
      return a.index - b.index;
    });

    const wl1 = wavelengthCandidates[0];
    const wl2 = wavelengthCandidates[1];
    return {
      wl1Index: wl1.index,
      wl2Index: wl2.index,
      wl1Nm: wl1.nominalNm,
      wl2Nm: wl2.nominalNm
    };
  }

  function buildChannelMap(measurements, selectedWavelengths, totalColumns) {
    const wl1Index = selectedWavelengths.wl1Index;
    const wl2Index = selectedWavelengths.wl2Index;
    const byPair = new Map();

    measurements.forEach(entry => {
      const col = Number(entry.columnIndex);
      if (!Number.isInteger(col) || col < 0 || col >= totalColumns) return;
      const wlIndex = Number(entry.wavelengthIndex);
      if (!Number.isFinite(wlIndex)) return;
      if (Math.round(wlIndex) !== wl1Index && Math.round(wlIndex) !== wl2Index) return;

      const sourceIndex = Math.round(Number(entry.sourceIndex));
      const detectorIndex = Math.round(Number(entry.detectorIndex));
      if (!Number.isFinite(sourceIndex) || !Number.isFinite(detectorIndex)) return;

      const key = sourceIndex + ":" + detectorIndex;
      if (!byPair.has(key)) {
        byPair.set(key, {
          sourceIndex,
          detectorIndex,
          wl1Column: null,
          wl2Column: null,
          minColumn: col
        });
      }
      const pair = byPair.get(key);
      pair.minColumn = Math.min(pair.minColumn, col);
      if (Math.round(wlIndex) === wl1Index && pair.wl1Column === null) pair.wl1Column = col;
      if (Math.round(wlIndex) === wl2Index && pair.wl2Column === null) pair.wl2Column = col;
    });

    const channels = Array.from(byPair.values())
      .filter(pair => pair.wl1Column !== null && pair.wl2Column !== null)
      .sort((a, b) => a.minColumn - b.minColumn);
    return { channels };
  }

  function buildWavelengthMatrices(dataMatrix, channels) {
    const wl1 = new Array(dataMatrix.rows);
    const wl2 = new Array(dataMatrix.rows);
    for (let row = 0; row < dataMatrix.rows; row += 1) {
      const wl1Row = new Array(channels.length);
      const wl2Row = new Array(channels.length);
      for (let idx = 0; idx < channels.length; idx += 1) {
        const channel = channels[idx];
        wl1Row[idx] = dataMatrix.get(row, channel.wl1Column);
        wl2Row[idx] = dataMatrix.get(row, channel.wl2Column);
      }
      wl1[row] = wl1Row;
      wl2[row] = wl2Row;
    }
    return { wl1, wl2 };
  }

  function readSnirfEvents(file, nirsPath, startTimeSeconds, samplingRate) {
    const stimKeys = listGroupKeys(file, nirsPath)
      .filter(key => /^stim\d*$/i.test(key))
      .sort((a, b) => compareIndexedNames(a, b, "stim"));
    const events = [];

    stimKeys.forEach((stimKey, stimOrdinal) => {
      const stimPath = joinPath(nirsPath, stimKey);
      const nameLabel = readStringScalarOptional(file, joinPath(stimPath, "name")) || stimKey;
      const stimData = readNumericMatrixOptional(file, joinPath(stimPath, "data"), "stim data");
      if (!stimData || !stimData.rows || stimData.columns < 1) return;

      for (let row = 0; row < stimData.rows; row += 1) {
        const onsetSeconds = stimData.get(row, 0);
        if (!Number.isFinite(onsetSeconds)) continue;
        const codeValue = stimData.columns >= 3 ? stimData.get(row, 2) : (stimOrdinal + 1);
        const fallbackCode = stimOrdinal + 1;
        const code = Number.isFinite(codeValue) && Math.round(codeValue) !== 0
          ? Math.round(codeValue)
          : fallbackCode;
        const sample = Math.max(0, Math.round((onsetSeconds - startTimeSeconds) * samplingRate));
        events.push({
          sample,
          code,
          label: sanitizeString(nameLabel) || ("E" + code)
        });
      }
    });

    events.sort((a, b) => {
      if (a.sample !== b.sample) return a.sample - b.sample;
      return a.code - b.code;
    });

    const seen = new Set();
    const deduped = [];
    events.forEach(event => {
      const key = event.sample + "|" + event.code + "|" + event.label;
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(event);
    });
    return deduped;
  }

  function parseTimeInfo(file, timePath, sampleCount) {
    const timeVector = readNumericVector(file, timePath);
    if (timeVector.length < 2) {
      throw new Error("SNIRF time dataset must contain at least two samples.");
    }

    const dt = estimatePositiveStep(timeVector);
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new Error("SNIRF time vector does not contain a valid positive sample step.");
    }
    const samplingRate = 1 / dt;
    if (!Number.isFinite(samplingRate) || samplingRate <= 0) {
      throw new Error("Failed to derive sampling rate from SNIRF time vector.");
    }

    if (Number.isFinite(sampleCount) && sampleCount > 0 && timeVector.length !== sampleCount) {
      throw new Error(
        "SNIRF time length (" + timeVector.length + ") does not match data rows (" + sampleCount + ")."
      );
    }

    return {
      samplingRate,
      startTimeSeconds: Number(timeVector[0]) || 0
    };
  }

  function estimatePositiveStep(values) {
    let total = 0;
    let count = 0;
    for (let idx = 1; idx < values.length; idx += 1) {
      const prev = Number(values[idx - 1]);
      const next = Number(values[idx]);
      const diff = next - prev;
      if (!Number.isFinite(diff) || diff <= 0) continue;
      total += diff;
      count += 1;
      if (count >= 128) break;
    }
    return count ? (total / count) : null;
  }

  function buildChannelDistances(file, probePath, channels) {
    const sourcePos = readPositionMatrixOptional(file, joinPath(probePath, "sourcePos3D"))
      || readPositionMatrixOptional(file, joinPath(probePath, "sourcePos2D"));
    const detectorPos = readPositionMatrixOptional(file, joinPath(probePath, "detectorPos3D"))
      || readPositionMatrixOptional(file, joinPath(probePath, "detectorPos2D"));
    if (!sourcePos || !detectorPos) return [];

    return channels.map(channel => {
      const sourcePoint = getPositionRow(sourcePos, channel.sourceIndex - 1);
      const detectorPoint = getPositionRow(detectorPos, channel.detectorIndex - 1);
      if (!sourcePoint || !detectorPoint) return null;
      const dims = Math.min(sourcePoint.length, detectorPoint.length);
      if (!dims) return null;
      let sumSq = 0;
      for (let idx = 0; idx < dims; idx += 1) {
        const delta = Number(sourcePoint[idx]) - Number(detectorPoint[idx]);
        if (!Number.isFinite(delta)) return null;
        sumSq += delta * delta;
      }
      const distance = Math.sqrt(sumSq);
      return Number.isFinite(distance) ? distance : null;
    });
  }

  function getPositionRow(positionMatrix, rowIndex) {
    if (rowIndex < 0 || rowIndex >= positionMatrix.rows) return null;
    const row = new Array(positionMatrix.columns);
    for (let idx = 0; idx < positionMatrix.columns; idx += 1) {
      row[idx] = positionMatrix.get(rowIndex, idx);
    }
    return row;
  }

  function readPositionMatrixOptional(file, path) {
    return readNumericMatrixOptional(file, path, "position matrix");
  }

  function readNumericVector(file, path) {
    const node = getDatasetNode(file, path);
    const values = datasetToNumberArray(node.value);
    if (!values.length) {
      throw new Error("Dataset at '" + path + "' is empty.");
    }
    return values;
  }

  function readNumericVectorOptional(file, path) {
    const node = getDatasetNode(file, path, true);
    if (!node) return [];
    return datasetToNumberArray(node.value);
  }

  function readStringScalarOptional(file, path) {
    const node = getDatasetNode(file, path, true);
    if (!node) return null;
    const values = datasetToStringArray(node.value);
    return values.length ? values[0] : null;
  }

  function readFirstNumberOptional(file, path) {
    const values = readNumericVectorOptional(file, path);
    for (let idx = 0; idx < values.length; idx += 1) {
      const value = Number(values[idx]);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  function readNumericMatrix(file, path, label) {
    const node = getDatasetNode(file, path);
    return createMatrixAccessor(node.value, node.shape, label || path);
  }

  function readNumericMatrixOptional(file, path, label) {
    const node = getDatasetNode(file, path, true);
    if (!node) return null;
    return createMatrixAccessor(node.value, node.shape, label || path);
  }

  function getDatasetNode(file, path, optional) {
    let node = null;
    try {
      node = file.get(path);
    } catch (err) {
      if (optional) return null;
      throw new Error("Missing dataset at '" + path + "'.");
    }
    if (!node || !isDatasetNode(node)) {
      if (optional) return null;
      throw new Error("Expected dataset at '" + path + "'.");
    }
    return node;
  }

  function isDatasetNode(node) {
    if (!node) return false;
    if (node.constructor && node.constructor.name === "Dataset") return true;
    return Array.isArray(node.shape);
  }

  function createMatrixAccessor(rawValue, shape, label) {
    const dims = Array.isArray(shape) ? shape.slice() : [];
    if (dims.length < 2) {
      throw new Error("Dataset '" + label + "' must be a 2-D matrix.");
    }
    const rows = Number(dims[0]);
    const columns = Number(dims[1]);
    if (!Number.isFinite(rows) || !Number.isFinite(columns) || rows <= 0 || columns <= 0) {
      throw new Error("Dataset '" + label + "' has invalid shape.");
    }

    if (Array.isArray(rawValue) && rawValue.length && Array.isArray(rawValue[0])) {
      return {
        rows,
        columns,
        get: (row, col) => Number(rawValue[row] && rawValue[row][col])
      };
    }

    const flat = flattenDataValues(rawValue);
    const expected = rows * columns;
    if (flat.length < expected) {
      throw new Error("Dataset '" + label + "' has fewer values than expected by its shape.");
    }

    return {
      rows,
      columns,
      get: (row, col) => Number(flat[(row * columns) + col])
    };
  }

  function flattenDataValues(rawValue) {
    if (ArrayBuffer.isView(rawValue)) return rawValue;
    if (!Array.isArray(rawValue)) {
      throw new Error("Unsupported HDF5 dataset value container.");
    }
    if (!rawValue.length) return rawValue;
    if (!Array.isArray(rawValue[0])) return rawValue;

    const out = [];
    rawValue.forEach(item => {
      if (Array.isArray(item)) {
        for (let idx = 0; idx < item.length; idx += 1) out.push(item[idx]);
      } else {
        out.push(item);
      }
    });
    return out;
  }

  function datasetToNumberArray(rawValue) {
    if (ArrayBuffer.isView(rawValue)) {
      return Array.from(rawValue, value => Number(value));
    }
    if (!Array.isArray(rawValue)) {
      const scalar = Number(rawValue);
      return Number.isFinite(scalar) ? [scalar] : [];
    }
    if (!rawValue.length) return [];
    if (!Array.isArray(rawValue[0])) return rawValue.map(value => Number(value));

    const out = [];
    rawValue.forEach(item => {
      if (Array.isArray(item)) {
        item.forEach(value => out.push(Number(value)));
      } else {
        out.push(Number(item));
      }
    });
    return out;
  }

  function datasetToStringArray(rawValue) {
    if (Array.isArray(rawValue)) return rawValue.map(sanitizeString);
    if (ArrayBuffer.isView(rawValue)) return Array.from(rawValue).map(value => sanitizeString(value));
    return [sanitizeString(rawValue)];
  }

  function sanitizeString(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/\u0000/g, "")
      .trim();
  }

  globalScope.fnirsSnirf = {
    parseSnirfArrayBuffer
  };
})(window);
