(function () {
  const KEY = 'campus-move-history-v1';

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function toRad(deg) {
    return deg * Math.PI / 180;
  }

  function haversineMeters(a, b) {
    if (!a || !b) return 0;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  function aggregateRecord(record) {
    if (!record || !Array.isArray(record.points) || !record.points.length) {
      return {
        ...record,
        meters: 0,
        segmentCount: 0,
        straightLineDistance: 0,
        avgSpeedMps: 0,
        avgSpeedKmH: 0,
        fastestAdjacentSpeedMps: 0,
        fastestAdjacentSpeedKmH: 0,
        validGpsPoints: 0,
        estKJ: safeNumber(record && record.kcal, 0)
      };
    }

    const points = record.points;
    let totalMeters = 0;
    let maxAdjacentSpeed = 0;
    let segmentCount = 0;

    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      const dist = haversineMeters(prev, curr);
      const dtSec = safeNumber(curr && curr.t && prev && prev.t ? (curr.t - prev.t) / 1000 : 0, 0);

      if (dist > 0 && dtSec > 0) {
        const speed = dist / dtSec;
        totalMeters += dist;
        segmentCount += 1;
        if (speed > maxAdjacentSpeed) maxAdjacentSpeed = speed;
      }
    }

    const elapsedSec = safeNumber(record.seconds, 0);
    const avgMps = elapsedSec > 0 ? totalMeters / elapsedSec : 0;
    const start = points[0];
    const end = points[points.length - 1];
    const straightLineDistance = start && end ? haversineMeters(start, end) : 0;
    const estKJ = safeNumber(record.kcal, safeNumber(record.estKJ, safeNumber(record.energyKJ, 0)));

    return {
      ...record,
      meters: totalMeters,
      segmentCount,
      straightLineDistance,
      avgSpeedMps: avgMps,
      avgSpeedKmH: avgMps * 3.6,
      fastestAdjacentSpeedMps: maxAdjacentSpeed,
      fastestAdjacentSpeedKmH: maxAdjacentSpeed * 3.6,
      validGpsPoints: points.length,
      estKJ
    };
  }

  function readRecords() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function downloadCsv(name, rows) {
    const csv = rows.map(row => row.map(value => {
      const text = String(value ?? '');
      return '"' + text.replaceAll('"', '""') + '"';
    }).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportAdvancedCsv() {
    const items = readRecords().map(aggregateRecord);
    const rows = [[
      '時間 ISO',
      '課堂代號',
      '類型',
      '活動',
      '身高 cm',
      '體重 kg',
      '年齡',
      '時間 sec',
      '距離 m',
      '平均速度 km/h',
      '估算熱量 kJ',
      '段數',
      '起點到終點直線距離 m',
      '最快相鄰點速度 km/h',
      '有效 GPS 點'
    ]];

    for (const item of items) {
      rows.push([
        item.date ? new Date(item.date).toISOString() : '',
        item.alias || '',
        item.type || '',
        item.mode || '',
        safeNumber(item.height, 0),
        safeNumber(item.weight, 0),
        safeNumber(item.age, 0),
        safeNumber(item.seconds, 0),
        safeNumber(item.meters, 0),
        safeNumber(item.avgSpeedKmH, 0).toFixed(2),
        safeNumber(item.estKJ, 0).toFixed(1),
        safeNumber(item.segmentCount, 0),
        safeNumber(item.straightLineDistance, 0).toFixed(2),
        safeNumber(item.fastestAdjacentSpeedKmH, 0).toFixed(2),
        safeNumber(item.validGpsPoints, 0)
      ]);
    }

    downloadCsv('campus-move-advanced.csv', rows);
  }

  function patchExportAll() {
    const exportBtn = document.getElementById('exportAll');
    if (!exportBtn || exportBtn.dataset.gpsMetricsPatched === '1') return;

    exportBtn.dataset.gpsMetricsPatched = '1';
    const original = exportBtn.onclick;
    exportBtn.onclick = function () {
      if (typeof original === 'function') {
        try {
          original.call(this);
        } catch (err) {
          console.warn('Original export handler failed', err);
        }
      }
      exportAdvancedCsv();
    };
  }

  function patchFinish() {
    const finishBtn = document.getElementById('finish');
    if (!finishBtn || finishBtn.dataset.gpsMetricsPatched === '1') return;

    finishBtn.dataset.gpsMetricsPatched = '1';
    const original = finishBtn.onclick;
    finishBtn.onclick = function (event) {
      const result = typeof original === 'function' ? original.call(this, event) : undefined;
      const session = window.session;
      if (session) {
        const enriched = aggregateRecord(session);
        Object.assign(session, enriched);
      }
      return result;
    };
  }

  function bootstrap() {
    patchExportAll();
    patchFinish();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
