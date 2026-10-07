// MET Norway worldwide forecast, attributed CC BY 4.0. No GPS required.
const SOURCE = 'https://api.met.no/doc/TermsOfService';
const cache = new Map(), pending = new Map();
let retryAfter = 0, lastRequest = 0;
exports.forecast = async data => {
  const { latitude, longitude } = data;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('请提供有效路线坐标');
  const lat = latitude.toFixed(2), lon = longitude.toFixed(2), key = `${lat},${lon}`;
  const prior = cache.get(key);
  try {
    if (prior && prior.expiresAt > Date.now()) return prior.result;
    let task = pending.get(key);
    if (!task) {
      if (Date.now() < retryAfter || Date.now() - lastRequest < 250) throw new Error('backoff');
      lastRequest = Date.now();
      task = (async () => {
        const headers = { 'User-Agent': 'HikingEarth/0.2 (https://github.com/hiking-earth/clients; support: 2308582955@qq.com)', Accept: 'application/json' };
        if (prior?.modified) headers['If-Modified-Since'] = prior.modified;
        const response = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
        if ([403,429].includes(response.status)) retryAfter = Date.now() + 60000;
        const expiresAt = Math.max(Date.now()+60000, Date.parse(response.headers.get('expires') || '') || Date.now()+3600000);
        if (response.status === 304 && prior) return { ...prior, expiresAt };
        if (!response.ok) throw new Error('provider');
        const payload = await response.json();
        const point = payload?.properties?.timeseries?.find(p => typeof p.time === 'string' && Date.parse(p.time) >= Date.now()-3600000 && Date.parse(p.time) <= Date.now()+7200000);
        const details = point?.data?.instant?.details;
        if (!details || ![details.air_temperature, details.wind_speed, details.relative_humidity].every(Number.isFinite)
            || details.air_temperature < -100 || details.air_temperature > 70 || details.wind_speed < 0 || details.wind_speed > 150
            || details.relative_humidity < 0 || details.relative_humidity > 100) throw new Error('schema');
        const rain = point.data.next_1_hours?.details?.precipitation_amount;
        if (rain !== undefined && (!Number.isFinite(rain) || rain < 0 || rain > 1000)) throw new Error('schema');
        return { expiresAt, modified: response.headers.get('last-modified') || '', result: {
          status: 'available', provider: 'MET Norway', license: 'CC BY 4.0', sourceUrl: SOURCE, type: 'forecast',
          weather: { city: key, temperature: `${details.air_temperature} °C`, wind: `${details.wind_speed} m/s`,
            humidity: `${details.relative_humidity}%`, rain: Number.isFinite(rain) ? `${rain} mm / 下一小时` : '暂无逐小时预报', observedAt: point.time },
        } };
      })();
      pending.set(key, task);
    }
    try {
      const entry = await task;
      if (cache.size >= 512 && !cache.has(key)) cache.delete(cache.keys().next().value);
      cache.set(key, entry); return entry.result;
    } finally { pending.delete(key); }
  } catch(error) {
    // No request headers, credentials or coordinates in diagnostic logs.
    console.warn('MET forecast unavailable', { reason: ['backoff','provider','schema'].includes(error.message) ? error.message : error.name });
    return { status: 'unavailable', message: '天气预报暂不可用，请查属地预警后再出发。', sourceUrl: SOURCE };
  }
};
