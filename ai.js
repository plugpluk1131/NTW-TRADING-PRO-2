// ==============================
// NTW AI PRO ENGINE v7.0
// FIX: SELL bias, better predict
// ==============================

const fs = require("fs");

// ------------------------------
// MEMORY
// ------------------------------
let tradeMemory = [];

function loadMemory() {
  try {
    if (fs.existsSync("memory.json")) {
      let data = fs.readFileSync("memory.json", "utf8");
      tradeMemory = JSON.parse(data);
    }
  } catch (e) { tradeMemory = []; }
}

function saveMemory() {
  try {
    fs.writeFileSync("memory.json", JSON.stringify(tradeMemory, null, 2));
  } catch (e) {
    if (tradeMemory.length > 0) tradeMemory.shift();
  }
}

loadMemory();

function logTrade(info) {
  tradeMemory.push(info);
  if (tradeMemory.length > 2000) tradeMemory.shift();
  saveMemory();
}

function learnTrade(pattern, result) {
  if (!pattern) return;
  logTrade({ pattern, result, time: Date.now() });
}

// ------------------------------
// UTILS
// ------------------------------
function average(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  if (!arr || arr.length === 0) return 0;
  let avg = average(arr);
  return Math.sqrt(average(arr.map(v => (v - avg) ** 2)));
}

// ------------------------------
// ATR
// ------------------------------
function calcATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return 0;
  let trs = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    let c = candles[i], prev = candles[i - 1];
    trs.push(Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    ));
  }
  return average(trs);
}

// ------------------------------
// MARKET STRUCTURE (แม่นขึ้น)
// ------------------------------
function marketStructure(candles) {
  if (!candles || candles.length < 10) return "NONE";
  // ใช้ swing high/low จริง ไม่ใช่แค่ index ถัดกัน
  let highs = candles.slice(-10).map(c => c.high);
  let lows = candles.slice(-10).map(c => c.low);
  let h1 = Math.max(...highs.slice(0, 5)), h2 = Math.max(...highs.slice(5));
  let l1 = Math.min(...lows.slice(0, 5)), l2 = Math.min(...lows.slice(5));

  if (h2 > h1 && l2 > l1) return "HH"; // Higher High + Higher Low
  if (h2 < h1 && l2 < l1) return "LL"; // Lower Low + Lower High
  if (h2 < h1 && l2 > l1) return "LH"; // Lower High
  if (h2 > h1 && l2 < l1) return "HL"; // Higher Low
  return "RANGE";
}

// ------------------------------
// CANDLE PSYCHOLOGY
// ------------------------------
function candlePsychology(candle) {
  if (!candle) return "NORMAL";
  let body = Math.abs(candle.close - candle.open);
  let range = candle.high - candle.low;
  if (range === 0) return "NORMAL";
  let upper = candle.high - Math.max(candle.close, candle.open);
  let lower = Math.min(candle.close, candle.open) - candle.low;
  if (lower > body * 2 && lower > upper) return "HAMMER";
  if (upper > body * 2 && upper > lower) return "SHOOTING_STAR";
  if (body < range * 0.15) return "DOJI";
  if (body > range * 0.85) return (candle.close > candle.open ? "BULL_MARUBOZU" : "BEAR_MARUBOZU");
  return "NORMAL";
}

// ------------------------------
// SUPPORT RESISTANCE
// ------------------------------
function detectSR(candles) {
  if (!candles || candles.length < 2) {
    let last = candles[candles.length - 1];
    return { support: last.low, resistance: last.high };
  }
  let s = candles.slice(-50);
  return {
    support: Math.min(...s.map(c => c.low)),
    resistance: Math.max(...s.map(c => c.high))
  };
}

// ------------------------------
// DOUBLE TOP / BOTTOM
// ------------------------------
function doubleTop(candles) {
  if (!candles || candles.length < 30) return false;
  let highs = candles.slice(-30).map(c => c.high);
  let max = Math.max(...highs);
  return highs.filter(h => Math.abs(h - max) < max * 0.003).length >= 2;
}

function doubleBottom(candles) {
  if (!candles || candles.length < 30) return false;
  let lows = candles.slice(-30).map(c => c.low);
  let min = Math.min(...lows);
  return lows.filter(l => Math.abs(l - min) < min * 0.003).length >= 2;
}

// ------------------------------
// LIQUIDITY SWEEP (แม่นขึ้น)
// ------------------------------
function liquiditySweep(candles) {
  if (!candles || candles.length < 5) return "NONE";
  let last = candles[candles.length - 1];
  let prev = candles[candles.length - 2];
  let prev2 = candles[candles.length - 3];

  // Sweep above recent high แล้วปิดกลับ = bearish
  let recentHigh = Math.max(prev.high, prev2.high);
  if (last.high > recentHigh && last.close < recentHigh * 0.999) return "BUY_SWEEP"; // sweep buy side → sell signal

  // Sweep below recent low แล้วปิดกลับ = bullish
  let recentLow = Math.min(prev.low, prev2.low);
  if (last.low < recentLow && last.close > recentLow * 1.001) return "SELL_SWEEP"; // sweep sell side → buy signal

  return "NONE";
}

// ------------------------------
// VOLUME ANALYSIS
// ------------------------------
function volumeAnalysis(volumes) {
  if (!volumes || volumes.length < 20) return "NORMAL";
  let avg = average(volumes.slice(-20));
  let last = volumes[volumes.length - 1];
  if (last > avg * 2.5) return "SPIKE";
  if (last > avg * 1.5) return "HIGH";
  if (last < avg * 0.4) return "DRY";
  return "NORMAL";
}

// ------------------------------
// PATTERN WINRATE MEMORY
// ------------------------------
function patternWinrate(pattern) {
  let trades = tradeMemory.filter(t => t.pattern === pattern);
  if (trades.length < 10) return 50;
  let wins = trades.filter(t => t.result === "WIN").length;
  return (wins / trades.length) * 100;
}

// ------------------------------
// EMA
// ------------------------------
function ema(values, period) {
  if (!values || values.length < period) return values ? values[values.length - 1] : 0;
  let k = 2 / (period + 1), val = values[0];
  for (let i = 1; i < values.length; i++) val = values[i] * k + val * (1 - k);
  return val;
}

// ------------------------------
// TREND STRENGTH
// ------------------------------
function trendStrength(candles) {
  if (candles.length < 50) return 0;
  let closes = candles.map(c => c.close);
  let ema20 = ema(closes.slice(-20), 20);
  let ema50 = ema(closes.slice(-50), 50);
  return ema20 - ema50;
}

// ------------------------------
// RSI DIVERGENCE (แม่นขึ้น)
// ------------------------------
function rsiDivergence(candles, rsi) {
  if (candles.length < 15) return "NONE";

  // Bullish: price ทำ LL แต่ RSI ทำ HL
  let priceOld = Math.min(...candles.slice(-15, -8).map(c => c.low));
  let priceNew = Math.min(...candles.slice(-8).map(c => c.low));
  if (priceNew < priceOld && rsi > 30 && rsi < 50) return "BULL_DIV";

  // Bearish: price ทำ HH แต่ RSI ทำ LH
  let priceHOld = Math.max(...candles.slice(-15, -8).map(c => c.high));
  let priceHNew = Math.max(...candles.slice(-8).map(c => c.high));
  if (priceHNew > priceHOld && rsi < 70 && rsi > 50) return "BEAR_DIV";

  return "NONE";
}

// ------------------------------
// SESSION
// ------------------------------
function tradingSession() {
  let hour = new Date().getUTCHours();
  if (hour >= 13 && hour <= 17) return "LONDON_NY";  // overlap = best
  if (hour >= 7 && hour <= 12) return "LONDON";
  if (hour >= 18 && hour <= 21) return "NEWYORK";
  return "ASIA";
}

// ------------------------------
// VWAP
// ------------------------------
function calcVWAP(candles) {
  let pv = 0, vol = 0;
  for (let c of candles) {
    let price = (c.high + c.low + c.close) / 3;
    pv += price * (c.volume || 1);
    vol += (c.volume || 1);
  }
  return vol === 0 ? 0 : pv / vol;
}

// ------------------------------
// LIQUIDITY POOL
// ------------------------------
function liquidityPool(candles) {
  if (candles.length < 20) return "NONE";
  let highs = candles.slice(-20).map(c => c.high);
  let lows = candles.slice(-20).map(c => c.low);
  let max = Math.max(...highs), min = Math.min(...lows);
  let last = candles[candles.length - 1];
  if (Math.abs(last.high - max) < max * 0.0015) return "BUY_LIQUIDITY";
  if (Math.abs(last.low - min) < min * 0.0015) return "SELL_LIQUIDITY";
  return "NONE";
}

// ------------------------------
// MOMENTUM
// ------------------------------
function momentum(candles) {
  if (candles.length < 10) return 0;
  return candles[candles.length - 1].close - candles[candles.length - 10].close;
}

function trendMomentum(candles) {
  let mom = momentum(candles);
  if (mom > 0) return "BULL";
  if (mom < 0) return "BEAR";
  return "FLAT";
}

// ------------------------------
// TREND EXHAUSTION
// ------------------------------
function trendExhaustion(candles) {
  if (candles.length < 20) return false;
  // ถ้า 5 แท่งล่าสุดมี body เล็กลงเรื่อยๆ = หมดแรง
  let bodies = candles.slice(-5).map(c => Math.abs(c.close - c.open));
  return bodies[4] < bodies[0] * 0.5;
}

// ------------------------------
// BREAKOUT
// ------------------------------
function breakout(candles) {
  if (candles.length < 20) return "NONE";
  let highs = candles.slice(-21, -1).map(c => c.high);
  let lows = candles.slice(-21, -1).map(c => c.low);
  let resistance = Math.max(...highs);
  let support = Math.min(...lows);
  let last = candles[candles.length - 1];
  if (last.close > resistance * 1.001) return "BREAKOUT";
  if (last.close < support * 0.999) return "BREAKDOWN";
  return "NONE";
}

// ------------------------------
// FAKE BREAKOUT
// ------------------------------
function fakeBreakout(candles) {
  if (candles.length < 10) return "NONE";
  let last = candles[candles.length - 1];
  let prev = candles[candles.length - 2];
  let prev2 = candles[candles.length - 3];
  let recentHigh = Math.max(prev.high, prev2.high);
  let recentLow = Math.min(prev.low, prev2.low);
  if (last.high > recentHigh && last.close < prev.close * 0.999) return "FAKE_UP";
  if (last.low < recentLow && last.close > prev.close * 1.001) return "FAKE_DOWN";
  return "NONE";
}

// ------------------------------
// VOLATILITY STATE
// ------------------------------
function volatilityState(candles) {
  let atr = calcATR(candles);
  if (atr === 0) return "LOW";
  let price = candles[candles.length - 1].close;
  if (atr > price * 0.008) return "EXTREME";
  if (atr > price * 0.004) return "HIGH";
  if (atr < price * 0.001) return "LOW";
  return "NORMAL";
}

// ------------------------------
// ORDER FLOW
// ------------------------------
function orderFlow(volumes) {
  if (!volumes || volumes.length < 10) return "NEUTRAL";
  let last = volumes.slice(-10);
  let avg = average(last);
  let current = last[last.length - 1];
  if (current > avg * 1.5) return "BUY_PRESSURE";
  if (current < avg * 0.6) return "SELL_PRESSURE";
  return "NEUTRAL";
}

// ------------------------------
// SPREAD FILTER
// ------------------------------
function spreadFilter(bid, ask) {
  if (!bid || !ask) return "NORMAL";
  let spread = ask - bid;
  if (spread > bid * 0.001) return "WIDE";
  return "NORMAL";
}

// ==============================
// SMART MONEY CONCEPT (SMC)
// ==============================
function detectCHoCH(candles) {
  if (!candles || candles.length < 10) return "NONE";
  let recent = candles.slice(-10);
  let firstHalf = recent.slice(0, 5), secondHalf = recent.slice(5);
  let h1 = Math.max(...firstHalf.map(c => c.high));
  let l1 = Math.min(...firstHalf.map(c => c.low));
  let h2 = Math.max(...secondHalf.map(c => c.high));
  let l2 = Math.min(...secondHalf.map(c => c.low));
  // BOS แล้ว CHoCH
  if (l2 < l1 && h2 < h1) return "BEARISH_CHOCH";
  if (h2 > h1 && l2 > l1) return "BULLISH_CHOCH";
  return "NONE";
}

function detectBOS(candles) {
  if (!candles || candles.length < 20) return "NONE";
  let prev = candles.slice(-20, -10);
  let curr = candles.slice(-10);
  let prevHigh = Math.max(...prev.map(c => c.high));
  let prevLow = Math.min(...prev.map(c => c.low));
  let lastClose = candles[candles.length - 1].close;
  let currHigh = Math.max(...curr.map(c => c.high));
  let currLow = Math.min(...curr.map(c => c.low));
  if (lastClose > prevHigh && currHigh > prevHigh) return "BULLISH_BOS";
  if (lastClose < prevLow && currLow < prevLow) return "BEARISH_BOS";
  return "NONE";
}

function premiumDiscountZone(candles) {
  if (!candles || candles.length < 50) return "NONE";
  let high = Math.max(...candles.slice(-50).map(c => c.high));
  let low = Math.min(...candles.slice(-50).map(c => c.low));
  let range = high - low;
  if (range === 0) return "NONE";
  let price = candles[candles.length - 1].close;
  let pos = (price - low) / range;
  if (pos < 0.35) return "DISCOUNT";
  if (pos > 0.65) return "PREMIUM";
  return "EQUILIBRIUM";
}

function detectFVG(candles) {
  if (!candles || candles.length < 5) return "NONE";
  let c1 = candles[candles.length - 3];
  let c3 = candles[candles.length - 1];
  if (c3.low > c1.high) return "BULLISH_FVG";
  if (c3.high < c1.low) return "BEARISH_FVG";
  return "NONE";
}

function detectOrderBlock(candles) {
  if (!candles || candles.length < 20) return { type: "NONE", level: 0 };
  let bodies = candles.slice(-20).map(c => Math.abs(c.close - c.open));
  let avgBody = average(bodies);
  for (let i = candles.length - 2; i >= candles.length - 15; i--) {
    let c = candles[i];
    let body = Math.abs(c.close - c.open);
    if (body > avgBody * 2) {
      let prev = candles[i - 1];
      if (c.close > c.open && prev && prev.close < prev.open) return { type: "BULLISH_OB", level: prev.low };
      if (c.close < c.open && prev && prev.close > prev.open) return { type: "BEARISH_OB", level: prev.high };
    }
  }
  return { type: "NONE", level: 0 };
}

function smcScore(candles) {
  if (!candles || candles.length < 20) return { score: 0, choch: "NONE", bos: "NONE", fvg: "NONE", zone: "NONE" };
  let score = 0;
  let choch = detectCHoCH(candles);
  let bos = detectBOS(candles);
  let zone = premiumDiscountZone(candles);
  let fvg = detectFVG(candles);
  let ob = detectOrderBlock(candles);

  if (choch === "BULLISH_CHOCH") score += 4;
  if (choch === "BEARISH_CHOCH") score -= 4;
  if (bos === "BULLISH_BOS") score += 3;
  if (bos === "BEARISH_BOS") score -= 3;
  if (zone === "DISCOUNT") score += 3;
  if (zone === "PREMIUM") score -= 3;
  if (fvg === "BULLISH_FVG") score += 2;
  if (fvg === "BEARISH_FVG") score -= 2;
  if (ob.type === "BULLISH_OB") score += 3;
  if (ob.type === "BEARISH_OB") score -= 3;

  return { score, choch, bos, fvg, zone, ob };
}

function smcEntryPoint(candles, signal) {
  if (!candles || candles.length < 20) return null;
  let price = candles[candles.length - 1].close;
  let atr = calcATR(candles);
  let ob = detectOrderBlock(candles);

  if (signal === "BUY") {
    let entry = (ob.type === "BULLISH_OB" && ob.level > 0) ? ob.level : price;
    return {
      entry: entry.toFixed(2),
      stoploss: (entry - atr * 1.5).toFixed(2),
      takeprofit: (entry + atr * 3.0).toFixed(2),
      rr: "1:2"
    };
  }
  if (signal === "SELL") {
    let entry = (ob.type === "BEARISH_OB" && ob.level > 0) ? ob.level : price;
    return {
      entry: entry.toFixed(2),
      stoploss: (entry + atr * 1.5).toFixed(2),
      takeprofit: (entry - atr * 3.0).toFixed(2),
      rr: "1:2"
    };
  }
  return null;
}

// ==============================
// WYCKOFF ANALYSIS
// ==============================
function wyckoffPhase(candles) {
  if (!candles || candles.length < 50) return "UNKNOWN";
  let early = candles.slice(0, 17);
  let mid = candles.slice(17, 34);
  let recent = candles.slice(34, 50);
  let earlyP = average(early.map(c => c.close));
  let midP = average(mid.map(c => c.close));
  let recentP = average(recent.map(c => c.close));
  let earlyV = average(early.map(c => c.volume || 1));
  let midV = average(mid.map(c => c.volume || 1));
  let recentV = average(recent.map(c => c.volume || 1));

  if (earlyP > midP && midV < earlyV && recentV > midV && recentP >= midP) return "ACCUMULATION";
  if (recentP > midP && midP > earlyP && recentV >= midV * 0.8) return "MARKUP";
  if (earlyP < midP && midV > earlyV && recentV < midV && recentP <= midP * 1.01) return "DISTRIBUTION";
  if (recentP < midP && midP < earlyP) return "MARKDOWN";
  return "RANGING";
}

function wyckoffSpring(candles) {
  if (!candles || candles.length < 20) return false;
  let lows = candles.slice(-20).map(c => c.low);
  let minLow = Math.min(...lows);
  let last = candles[candles.length - 1];
  let prev = candles[candles.length - 2];
  return last.low < minLow && last.close > prev.close && last.close > last.open;
}

function wyckoffUpthrust(candles) {
  if (!candles || candles.length < 20) return false;
  let highs = candles.slice(-20).map(c => c.high);
  let maxHigh = Math.max(...highs);
  let last = candles[candles.length - 1];
  let prev = candles[candles.length - 2];
  return last.high > maxHigh && last.close < prev.close && last.close < last.open;
}

function wyckoffCause(candles) {
  if (!candles || candles.length < 30) return 0;
  let prices = candles.slice(-30).map(c => c.close);
  let max = Math.max(...prices), min = Math.min(...prices);
  let range = max - min;
  if (range === 0) return 0;
  let std = stddev(prices);
  return Math.round(Math.max(0, 100 - (std / range * 100)));
}

function wyckoffVolumeClimax(candles) {
  if (!candles || candles.length < 20) return "NONE";
  let volumes = candles.slice(-20).map(c => c.volume || 1);
  let avgVol = average(volumes);
  let last = candles[candles.length - 1];
  let lastVol = last.volume || 1;
  if (lastVol > avgVol * 3) {
    if (last.close < last.open) return "SELLING_CLIMAX";
    if (last.close > last.open) return "BUYING_CLIMAX";
  }
  return "NONE";
}

function wyckoffScore(candles) {
  if (!candles || candles.length < 50) {
    return { score: 0, phase: "UNKNOWN", spring: false, upthrust: false, cause: 0, climax: "NONE" };
  }
  let score = 0;
  let phase = wyckoffPhase(candles);
  let spring = wyckoffSpring(candles);
  let upthrust = wyckoffUpthrust(candles);
  let cause = wyckoffCause(candles);
  let climax = wyckoffVolumeClimax(candles);

  if (phase === "ACCUMULATION") score += 4;
  if (phase === "MARKUP") score += 3;
  if (phase === "DISTRIBUTION") score -= 4;
  if (phase === "MARKDOWN") score -= 3;
  if (spring) score += 5;
  if (upthrust) score -= 5;
  if (cause > 70) score += 2;
  if (cause > 85) score += 2;
  if (climax === "SELLING_CLIMAX") score += 3;
  if (climax === "BUYING_CLIMAX") score -= 3;

  return { score, phase, spring, upthrust, cause, climax };
}

// ------------------------------
// TREND PROBABILITY
// ------------------------------
function trendProbability(candles) {
  if (!candles || candles.length < 2) return 50;
  let upMoves = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) upMoves++;
  }
  return Math.round((upMoves / (candles.length - 1)) * 100);
}

// ------------------------------
// LIQUIDITY ZONE
// ------------------------------
function liquidityZone(candles) {
  if (!candles || candles.length < 20) return { buy: 0, sell: 0 };
  let maxHigh = -Infinity, minLow = Infinity;
  for (const c of candles.slice(-20)) {
    if (c.high > maxHigh) maxHigh = c.high;
    if (c.low < minLow) minLow = c.low;
  }
  return { buy: minLow, sell: maxHigh };
}

// ------------------------------
// TRADE QUALITY (ฟังก์ชันเดิม - คงไว้)
// ------------------------------
function tradeQuality(score, volume, volatility) {
  let quality = score;
  if (volume === "SPIKE" || volume === "HIGH") quality += 2;
  if (volatility > 0) quality += 1;
  return quality;
}

// ------------------------------
// ORDERBLOCK STRENGTH (ฟังก์ชันเดิม - คงไว้)
// ------------------------------
function orderblockStrength(candles) {
  if (!candles || candles.length < 20) return 0;
  let moves = [];
  for (let i = candles.length - 10; i < candles.length; i++) {
    let c = candles[i];
    moves.push(Math.abs(c.close - c.open));
  }
  return average(moves);
}

// ==============================
// AI DECISION ENGINE (v7 - FIXED SELL BIAS)
// ==============================
function aiAnalyze(data) {
  let { rsi, macd, trend, pattern, liquidity, volume, candles, volumes, bid, ask } = data;

  if (!candles || candles.length === 0) {
    return { signal: "HOLD", confidence: 40, winrate: 50 };
  }

  let score = 0;

  // Spread filter
  if (spreadFilter(bid, ask) === "WIDE") score -= 2;

  let atr = calcATR(candles);
  let sr = detectSR(candles);
  let price = candles[candles.length - 1].close;

  // S/R proximity — สมมาตร BUY/SELL
  if (price <= sr.support * 1.003) score += 2;
  if (price >= sr.resistance * 0.997) score -= 2;

  let trendPower = trendStrength(candles);
  let div = rsiDivergence(candles, rsi);
  let session = tradingSession();
  let vwap = calcVWAP(candles);
  let liqPool = liquidityPool(candles);
  let momTrend = trendMomentum(candles);
  let brk = breakout(candles);
  let fake = fakeBreakout(candles);
  let volState = volatilityState(candles);
  let flow = orderFlow(volumes);

  if (volState === "LOW" && volume === "DRY") {
    return { signal: "HOLD", confidence: 40, winrate: 50 };
  }

  // RSI — สมมาตร
  if (rsi < 30) score += 3;
  else if (rsi < 40) score += 1;
  else if (rsi > 70) score -= 3;
  else if (rsi > 60) score -= 1;

  // MACD
  if (macd > 0) score += 1;
  if (macd < 0) score -= 1;

  // TREND POWER — สมมาตร
  if (trendPower > 0) score += 2;
  if (trendPower < 0) score -= 2;

  // TREND
  if (trend === "UPTREND" || trend === "BULLISH") score += 2;
  if (trend === "DOWNTREND" || trend === "BEARISH") score -= 2;

  // PATTERN
  if (pattern === "BREAKOUT" || pattern === "BULL_ENGULF" || pattern === "BULL_RUN_3") score += 2;
  if (pattern === "BREAKDOWN" || pattern === "BEAR_ENGULF" || pattern === "BEAR_RUN_3") score -= 2;

  // VOLUME
  if (volume === "SPIKE" || volume === "HIGH") score += 1;

  // SESSION (ลบ bias ที่ให้แต่ buy)
  if (session === "LONDON_NY" || session === "LONDON") score += 0; // neutral — session ไม่ควร bias

  // LIQUIDITY
  if (liquidity === "BUY SIDE" || liquidity === "BUY ZONE") score += 1;
  if (liquidity === "SELL SIDE" || liquidity === "SELL ZONE") score -= 1;

  // MARKET STRUCTURE
  let structure = marketStructure(candles);
  if (structure === "HH") score += 2;
  if (structure === "LL") score -= 2;
  if (structure === "LH") score -= 1;
  if (structure === "HL") score += 1;

  // DIVERGENCE
  if (div === "BULL_DIV") score += 3;
  if (div === "BEAR_DIV") score -= 3;

  // DOUBLE PATTERNS
  if (doubleBottom(candles)) score += 3;
  if (doubleTop(candles)) score -= 3;

  // LIQUIDITY SWEEP
  let sweep = liquiditySweep(candles);
  if (sweep === "SELL_SWEEP") score += 2;
  if (sweep === "BUY_SWEEP") score -= 2;

  // CANDLE PSYCHOLOGY
  let last = candles[candles.length - 1];
  let psy = candlePsychology(last);
  if (psy === "HAMMER" || psy === "BULL_MARUBOZU") score += 2;
  if (psy === "SHOOTING_STAR" || psy === "BEAR_MARUBOZU") score -= 2;
  if (psy === "DOJI") score *= 0.8; // uncertainty = reduce conviction

  // PATTERN MEMORY
  let pWin = patternWinrate(pattern);
  if (pWin > 65) score += 2;
  if (pWin < 40) score -= 2;

  // VWAP — สมมาตร
  if (price > vwap * 1.001) score += 1;
  if (price < vwap * 0.999) score -= 1;

  // MOMENTUM TREND
  if (momTrend === "BULL") score += 2;
  if (momTrend === "BEAR") score -= 2;

  // BREAKOUT
  if (brk === "BREAKOUT") score += 3;
  if (brk === "BREAKDOWN") score -= 3;

  // FAKE BREAKOUT
  if (fake === "FAKE_UP") score -= 3;
  if (fake === "FAKE_DOWN") score += 3;

  // LIQUIDITY POOL
  if (liqPool === "SELL_LIQUIDITY") score += 2;
  if (liqPool === "BUY_LIQUIDITY") score -= 2;

  // ORDER FLOW
  if (flow === "BUY_PRESSURE") score += 2;
  if (flow === "SELL_PRESSURE") score -= 2;

  // VOLATILITY
  if (volState === "HIGH" || volState === "EXTREME") score += Math.sign(score) * 1;

  // EXHAUSTION = ลดความเชื่อมั่น
  if (trendExhaustion(candles)) score *= 0.85;

  // FINAL SIGNAL — threshold สมมาตร
  let signal = "HOLD";
  if (score >= 4) signal = "BUY";
  if (score <= -4) signal = "SELL";

  // CONFIDENCE
  let trendBoost = Math.max(-5, Math.min(5, trendPower * 5));
  let confidence = Math.min(92, 45 + Math.abs(score) * 4 + (pWin * 0.2) + trendBoost);
  if (Math.abs(score) >= 6) confidence += 5;
  if (Math.abs(score) >= 8) confidence += 5;
  confidence = Math.min(confidence, 92);

  let winrate = Math.min(88, 48 + Math.abs(score) * 4);

  return { signal, confidence: Math.round(confidence), winrate: Math.round(winrate) };
}

// ------------------------------
// CLOSE TRADE (Learning)
// ------------------------------
function closeTrade(pattern, result) {
  if (!pattern || !result) return false;
  if (!["WIN", "LOSS"].includes(result)) return false;
  learnTrade(pattern, result);
  return true;
}

// ==============================
// MODULE EXPORTS
// ==============================
module.exports = {
  aiAnalyze,
  closeTrade,
  trendProbability,
  liquidityZone,
  smcScore,
  smcEntryPoint,
  wyckoffScore,
  // export utils สำหรับ app.js
  calcATR,
  detectSR,
  average,
  ema
};





