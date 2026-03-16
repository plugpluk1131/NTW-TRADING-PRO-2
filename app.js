// ==============================
// NTW AI PRO - app.js v6.0
// Day Trading + Swing Trading
// M1→D1 | Dual TP | Predictive
// ทำงานร่วมกับ ai.js เต็มรูปแบบ
// ==============================

const fs      = require("fs");
const express = require("express");
const path    = require("path");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const {
  aiAnalyze, smcScore, smcEntryPoint,
  wyckoffScore, trendProbability,
  liquidityZone, closeTrade
} = require("./ai");

// --- MEMORY ---
let tradeMemory = [];
function loadMemory() {
  try { if (fs.existsSync("memory.json")) tradeMemory = JSON.parse(fs.readFileSync("memory.json")); }
  catch(e) { tradeMemory = []; }
}
function saveMemory() {
  try { fs.writeFileSync("memory.json", JSON.stringify(tradeMemory, null, 2)); }
  catch(e) {}
}
loadMemory();

const server = express();
server.use(express.json());

// ==============================
// UTILS
// ==============================
function average(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a,b) => a+b, 0) / arr.length;
}
function ema(values, period) {
  if (!values || values.length < period) return values ? values[values.length-1] : 0;
  let k = 2/(period+1), val = values[0];
  for (let i=1; i<values.length; i++) val = values[i]*k + val*(1-k);
  return val;
}
function calcRSI(candles, period=14) {
  if (!candles || candles.length < period+1) return 50;
  let gains=[], losses=[];
  for (let i=candles.length-period; i<candles.length; i++) {
    let d = candles[i].close - candles[i-1].close;
    if (d>0) gains.push(d); else losses.push(Math.abs(d));
  }
  let ag = gains.length ? average(gains) : 0;
  let al = losses.length ? average(losses) : 0;
  if (al===0) return 100;
  return Math.round(100 - (100/(1+ag/al)));
}
function calcMACD(candles) {
  if (!candles || candles.length < 26) return 0;
  let cl = candles.map(c=>c.close);
  return ema(cl.slice(-12),12) - ema(cl.slice(-26),26);
}
function calcATR(candles, period=14) {
  if (!candles || candles.length < period+1) return 0;
  let trs=[];
  for (let i=candles.length-period; i<candles.length; i++) {
    let c=candles[i], p=candles[i-1];
    trs.push(Math.max(c.high-c.low, Math.abs(c.high-p.close), Math.abs(c.low-p.close)));
  }
  return average(trs);
}
function detectSR(candles) {
  if (!candles || candles.length < 2) {
    let l=candles[candles.length-1]; return {support:l.low, resistance:l.high};
  }
  let s = candles.slice(-50);
  return { support: Math.min(...s.map(c=>c.low)), resistance: Math.max(...s.map(c=>c.high)) };
}

// ==============================
// FETCH (รองรับทุก TF: 1m→1d)
// ==============================
async function fetchCandles(symbol, interval="15m", limit=100) {
  try {
    let res  = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    let data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(k => ({
      open:parseFloat(k[1]), high:parseFloat(k[2]),
      low:parseFloat(k[3]),  close:parseFloat(k[4]),
      volume:parseFloat(k[5])
    }));
  } catch(e) { return []; }
}

// ==============================
// LAYER 1: MULTI-TF TREND (5 TF)
// Day: 1h+4h+1d | Scalp: 1m+5m
// ==============================
function multiTFTrend(c1m, c5m, c15m, c1h, c4h, c1d) {
  let score=0, aligned=0;
  function dir(c, f, s) {
    if (!c || c.length<s) return 0;
    let cl=c.map(x=>x.close);
    return ema(cl.slice(-f),f) > ema(cl.slice(-s),s) ? 1 : -1;
  }
  // น้ำหนักตาม TF (ใหญ่กว่า = สำคัญกว่า)
  const d1m  = dir(c1m,  5,  13);   // weight 1
  const d5m  = dir(c5m,  8,  21);   // weight 2
  const d15m = dir(c15m, 20, 50);   // weight 3
  const d1h  = dir(c1h,  20, 50);   // weight 4
  const d4h  = dir(c4h,  20, 50);   // weight 5
  const d1d  = dir(c1d,  10, 20);   // weight 6

  score = d1d*6 + d4h*5 + d1h*4 + d15m*3 + d5m*2 + d1m*1;
  aligned = [d1m,d5m,d15m,d1h,d4h,d1d].filter(d=>d===Math.sign(score)).length;

  // Day trade bias: 4h+1d เห็นตรงกัน
  const dayBias = (d4h===d1d && d4h!==0) ? d4h*3 : 0;
  score += dayBias;

  const label = score>0?"BULLISH":score<0?"BEARISH":"NEUTRAL";
  return { score, aligned, label, d1d, d4h, d1h, d15m };
}

// ==============================
// LAYER 2: MOMENTUM PRECISION
// RSI divergence + MACD histogram
// ==============================
function momentumPrecision(rsi, macdVal, candles, c5m) {
  let score=0, urgency=0;

  // RSI zones
  if      (rsi<15){score+=7;urgency=3;} else if(rsi<25){score+=5;urgency=3;}
  else if (rsi<35){score+=3;urgency=2;} else if(rsi<45){score+=1;urgency=1;}
  else if (rsi>85){score-=7;urgency=3;} else if(rsi>75){score-=5;urgency=3;}
  else if (rsi>65){score-=3;urgency=2;} else if(rsi>55){score-=1;urgency=1;}

  // MACD
  if(macdVal>0)score+=1; if(macdVal<0)score-=1;

  // RSI divergence (bullish: price ลง แต่ RSI ขึ้น)
  if (candles.length>=20) {
    let src = c5m && c5m.length>=20 ? c5m : candles;
    let priceOld = src[src.length-10].close;
    let priceNew = src[src.length-1].close;
    if (priceNew < priceOld && rsi > 40) { score+=3; urgency=Math.max(urgency,2); } // Bull div
    if (priceNew > priceOld && rsi < 60) { score-=3; urgency=Math.max(urgency,2); } // Bear div
  }

  // M1 momentum chain
  if (candles.length>=3) {
    let [a,b,c]=[candles[candles.length-1],candles[candles.length-2],candles[candles.length-3]];
    if(a.close>b.close&&b.close>c.close){score+=2;urgency=Math.max(urgency,1);}
    if(a.close<b.close&&b.close<c.close){score-=2;urgency=Math.max(urgency,1);}
  }

  return { score, urgency };
}

// ==============================
// LAYER 3: PRECISION CANDLE
// M5 pattern + M1 confirm
// ==============================
function precisionCandle(c1m, c5m) {
  let score=0, trigger="NONE";
  let src = c5m && c5m.length>=5 ? c5m : c1m;
  if (!src || src.length<4) return {score,trigger};

  let c=src[src.length-1], p1=src[src.length-2], p2=src[src.length-3], p3=src[src.length-4];
  let body=Math.abs(c.close-c.open), p1b=Math.abs(p1.close-p1.open);
  let range=c.high-c.low;
  let upper=c.high-Math.max(c.close,c.open), lower=Math.min(c.close,c.open)-c.low;

  // Engulfing
  if(c.close>c.open&&p1.close<p1.open&&body>p1b*1.2){score+=5;trigger="BULL_ENGULF";}
  if(c.close<c.open&&p1.close>p1.open&&body>p1b*1.2){score-=5;trigger="BEAR_ENGULF";}

  // Pin bar
  if(range>0){
    if(lower>body*2.5&&lower>upper*2){score+=4;trigger="HAMMER";}
    if(upper>body*2.5&&upper>lower*2){score-=4;trigger="SHOOTING_STAR";}
  }

  // 3-candle run
  if(c.close>p1.close&&p1.close>p2.close&&p2.close>p3.close){score+=4;trigger="BULL_RUN_3";}
  if(c.close<p1.close&&p1.close<p2.close&&p2.close<p3.close){score-=4;trigger="BEAR_RUN_3";}

  // Marubozu
  if(range>0&&body>range*0.85){score+=c.close>c.open?3:-3;trigger=c.close>c.open?"BULL_MARUBOZU":"BEAR_MARUBOZU";}

  // Inside bar breakout
  if(c.high<=p1.high&&c.low>=p1.low){ trigger="INSIDE_BAR"; } // compression

  // M1 final confirm
  if(c1m&&c1m.length>=2){
    let l=c1m[c1m.length-1], b=Math.abs(l.close-l.open), r=l.high-l.low;
    if(r>0&&b>r*0.8) score+=l.close>l.open?2:-2;
  }

  return { score, trigger };
}

// ==============================
// LAYER 4: VOLUME CONVICTION
// ==============================
function volumeConviction(c15m, c5m, c1m) {
  let score=0, state="NORMAL";
  let src = c5m&&c5m.length>=20 ? c5m : c15m;
  let vols=src.map(c=>c.volume), avg=average(vols.slice(-20));
  let last=vols[vols.length-1], lc=src[src.length-1], ratio=last/(avg||1);

  if     (ratio>4.0){state="CLIMAX"; score=lc.close>lc.open?6:-6;}
  else if(ratio>3.0){state="CLIMAX"; score=lc.close>lc.open?5:-5;}
  else if(ratio>2.0){state="SPIKE";  score=lc.close>lc.open?3:-3;}
  else if(ratio>1.5){state="HIGH";   score=lc.close>lc.open?1:-1;}
  else if(ratio<0.3){state="DRY";    score=-3;} // แห้งมาก = อย่าเข้า
  else if(ratio<0.5){state="DRY";    score=-2;}

  // Volume trend: 3 แท่งติดต่อกันสูงขึ้น = conviction
  if(src.length>=4){
    let v3=vols.slice(-4);
    if(v3[3]>v3[2]&&v3[2]>v3[1]&&lc.close>lc.open){score+=2;}
    if(v3[3]>v3[2]&&v3[2]>v3[1]&&lc.close<lc.open){score-=2;}
  }

  return { score, state };
}

// ==============================
// LAYER 5: STRUCTURE + SMC + WYCKOFF
// ==============================
function structureSMC(c5m, c15m, c1h, smcR, wyR) {
  let score=0, type="NONE";

  // Structure break (ใช้ 1h สำหรับ swing, 5m สำหรับ scalp)
  function bos(src, lookback=20) {
    if(!src||src.length<lookback+3) return 0;
    let hist=src.slice(-lookback,-3), rec=src.slice(-3);
    let ph=Math.max(...hist.map(c=>c.high)), pl=Math.min(...hist.map(c=>c.low));
    let lc=src[src.length-1].close;
    let rh=Math.max(...rec.map(c=>c.high)), rl=Math.min(...rec.map(c=>c.low));
    if(lc>ph*1.0005) return 5;
    if(lc<pl*0.9995) return -5;
    if(rh>ph&&lc<ph*0.999) return -3; // fake bull
    if(rl<pl&&lc>pl*1.001) return 3;  // fake bear
    return 0;
  }

  let scalp = bos(c5m&&c5m.length>=23?c5m:c15m, 15);
  let swing  = bos(c1h&&c1h.length>=23?c1h:c15m, 20);

  score += scalp*0.6 + swing*0.4; // scalp weight > swing for entry

  // SMC (จาก ai.js)
  score += Math.max(-8, Math.min(8, smcR.score*0.5));

  // Wyckoff (จาก ai.js)
  if(wyR.spring)   {score+=4; type="SPRING";}
  if(wyR.upthrust) {score-=4; type="UPTHRUST";}
  if(wyR.phase==="ACCUMULATION")score+=3;
  if(wyR.phase==="MARKUP")      score+=2;
  if(wyR.phase==="DISTRIBUTION")score-=3;
  if(wyR.phase==="MARKDOWN")    score-=2;

  return { score, type };
}

// ==============================
// LAYER 6: PREDICTIVE ENGINE
// มองล่วงหน้า 3-10 แท่ง
// ==============================
function predictiveEngine(candles, c5m, c1m, c1h) {
  let score=0, signals=[];

  let src = c5m&&c5m.length>=20 ? c5m : candles;

  // Momentum acceleration (ROC)
  if(src.length>=11){
    let roc5  = (src[src.length-1].close-src[src.length-6].close)/src[src.length-6].close*100;
    let roc10 = (src[src.length-1].close-src[src.length-11].close)/src[src.length-11].close*100;
    let accel = roc5-roc10;
    if(accel>0.15){score+=4;signals.push("ACCEL_UP");}
    if(accel<-0.15){score-=4;signals.push("ACCEL_DOWN");}
    if(accel>0.05){score+=2;} if(accel<-0.05){score-=2;}
  }

  // Volume expansion
  if(src.length>=5){
    let vols=src.slice(-5).map(c=>c.volume), avgV=average(vols.slice(0,4));
    let lv=vols[4], lc=src[src.length-1];
    if(lv>avgV*2){score+=lc.close>lc.open?3:-3;signals.push(lc.close>lc.open?"VOL_EXP_UP":"VOL_EXP_DN");}
    else if(lv>avgV*1.5){score+=lc.close>lc.open?1:-1;}
  }

  // Compression breakout
  if(src.length>=4){
    let c1=src[src.length-1],c2=src[src.length-2],c3=src[src.length-3];
    let comp=c2.high<c3.high&&c2.low>c3.low;
    if(comp&&c1.close>c2.high){score+=5;signals.push("BULL_BREAK");}
    if(comp&&c1.close<c2.low) {score-=5;signals.push("BEAR_BREAK");}
  }

  // M1 chain (5 แท่ง)
  if(c1m&&c1m.length>=5){
    let cl=c1m.slice(-5).map(c=>c.close);
    if(cl.every((v,i)=>i===0||v>=cl[i-1])){score+=3;signals.push("M1_BULL_5");}
    if(cl.every((v,i)=>i===0||v<=cl[i-1])){score-=3;signals.push("M1_BEAR_5");}
  }

  // HH/HL or LH/LL structure
  if(candles.length>=10){
    let h1=Math.max(...candles.slice(-10,-5).map(c=>c.high)), h2=Math.max(...candles.slice(-5).map(c=>c.high));
    let l1=Math.min(...candles.slice(-10,-5).map(c=>c.low)),  l2=Math.min(...candles.slice(-5).map(c=>c.low));
    if(h2>h1&&l2>l1){score+=3;signals.push("HH_HL");}
    if(h2<h1&&l2<l1){score-=3;signals.push("LH_LL");}
  }

  // 1h trend confirm for swing
  if(c1h&&c1h.length>=3){
    let lc1h=c1h[c1h.length-1], pc1h=c1h[c1h.length-2];
    if(lc1h.close>lc1h.open&&lc1h.close>pc1h.close){score+=2;signals.push("1H_BULL");}
    if(lc1h.close<lc1h.open&&lc1h.close<pc1h.close){score-=2;signals.push("1H_BEAR");}
  }

  let direction = score>0?"BULLISH":score<0?"BEARISH":"NEUTRAL";
  let strength  = Math.min(100, Math.abs(score)*8);
  return { score, direction, strength, signals };
}

// ==============================
// MAGNET LEVELS
// ==============================
function magnetLevels(candles, c1h) {
  let price=candles[candles.length-1].close;
  let swingH=[], swingL=[];

  // 15m swings
  for(let i=5;i<candles.length-5;i++){
    let sl=candles.slice(i-5,i+5);
    if(candles[i].high===Math.max(...sl.map(c=>c.high)))swingH.push(candles[i].high);
    if(candles[i].low ===Math.min(...sl.map(c=>c.low))) swingL.push(candles[i].low);
  }

  // 1h swings (swing targets ระยะกลาง)
  if(c1h&&c1h.length>=10){
    for(let i=3;i<c1h.length-3;i++){
      let sl=c1h.slice(i-3,i+3);
      if(c1h[i].high===Math.max(...sl.map(c=>c.high)))swingH.push(c1h[i].high);
      if(c1h[i].low ===Math.min(...sl.map(c=>c.low))) swingL.push(c1h[i].low);
    }
  }

  let above=swingH.filter(h=>h>price*1.0002).sort((a,b)=>a-b);
  let below=swingL.filter(l=>l<price*0.9998).sort((a,b)=>b-a);

  return {
    m1: above.length>0?above[0]:price*1.003,
    m2: above.length>1?above[1]:price*1.008,
    m3: above.length>2?above[2]:price*1.015,
    d1: below.length>0?below[0]:price*0.997,
    d2: below.length>1?below[1]:price*0.992,
    d3: below.length>2?below[2]:price*0.985,
  };
}

// ==============================
// DUAL TP (Scalp + Day + Swing)
// ==============================
function tripleTP(candles, c5m, c1h, signal, atr) {
  if(!signal||signal==="HOLD") return null;
  let price=candles[candles.length-1].close;
  let ml=magnetLevels(candles, c1h);

  // Velocity
  let src=c5m&&c5m.length>20?c5m:candles;
  let vel=0, accel=0;
  if(src.length>=11){
    let roc5=(src[src.length-1].close-src[src.length-6].close)/src[src.length-6].close*100;
    let roc10=(src[src.length-1].close-src[src.length-11].close)/src[src.length-11].close*100;
    vel=Math.abs(roc5); accel=roc5-roc10;
  }
  let velMult=Math.min(3.5,1+vel*0.8);
  let accelBonus=accel>0.1?0.5:0;

  let sl, tp1, tp2, tp3;

  if(signal==="BUY"){
    sl  = (price - atr*1.0).toFixed(2);
    tp1 = Math.min(ml.m1, price + atr*1.5).toFixed(2);          // Scalp
    tp2 = Math.min(ml.m2, price + atr*(3.5+accelBonus)).toFixed(2); // Day
    tp3 = Math.min(ml.m3, price + atr*(6.0+accelBonus)*velMult).toFixed(2); // Swing
  } else {
    sl  = (price + atr*1.0).toFixed(2);
    tp1 = Math.max(ml.d1, price - atr*1.5).toFixed(2);
    tp2 = Math.max(ml.d2, price - atr*(3.5+accelBonus)).toFixed(2);
    tp3 = Math.max(ml.d3, price - atr*(6.0+accelBonus)*velMult).toFixed(2);
  }

  let tp1p=Math.abs(parseFloat(tp1)-price).toFixed(0);
  let tp2p=Math.abs(parseFloat(tp2)-price).toFixed(0);
  let tp3p=Math.abs(parseFloat(tp3)-price).toFixed(0);
  let slp =Math.abs(parseFloat(sl) -price).toFixed(0);

  return {
    sl, tp1, tp2, tp3,
    tp1Pts:tp1p, tp2Pts:tp2p, tp3Pts:tp3p, slPts:slp,
    rr1:(slp>0?(tp1p/slp).toFixed(1):"0"),
    rr2:(slp>0?(tp2p/slp).toFixed(1):"0"),
    rr3:(slp>0?(tp3p/slp).toFixed(1):"0"),
    velocity:vel.toFixed(3), accel:accel.toFixed(3)
  };
}

// ==============================
// CONFLUENCE DECISION (6 layers)
// Scalp: 3/6 + urgency
// Day:   4/6
// Swing: 5/6 + 1h confirm
// ==============================
function confluenceDecision(layerScores, urgency, tfAligned, d1h_dir, d4h_dir) {
  let scores=Object.values(layerScores);
  let total=scores.reduce((a,b)=>a+b,0);
  let bull=scores.filter(s=>s>0).length, bear=scores.filter(s=>s<0).length;

  // Signal thresholds
  let signal="HOLD";

  // Swing: ต้องการ 5/6 + 4h+1h เห็นตรงกัน
  let swingConf = (bull>=5||bear>=5) && d4h_dir===d1h_dir && d4h_dir!==0;
  // Day: 4/6
  let dayConf   = (bull>=4||bear>=4);
  // Scalp: 3/6 + urgency
  let scalpConf = (bull>=3||bear>=3) && tfAligned>=3 && urgency>0;

  if(swingConf && total>=15) signal=total>0?"BUY":"SELL";
  else if(dayConf && total>=12) signal=total>0?"BUY":"SELL";
  else if(dayConf && total>=9)  signal=total>0?"BUY":"SELL";
  else if(scalpConf && total>=8) signal=total>0?"BUY":"SELL";

  // Confidence
  let agr=Math.max(bull,bear)/scores.length;
  let swingBonus=swingConf?10:0, dayBonus=dayConf?5:0;
  let conf=Math.max(35,Math.min(92,Math.round(
    agr*40 + tfAligned*3 + urgency*5 + Math.min(18,Math.abs(total)*1.0) + swingBonus + dayBonus
  )));

  // Winrate
  let wr=Math.min(88,Math.round(38+Math.abs(total)*1.8+tfAligned*3+urgency*4+(swingConf?8:0)));

  // Trade type
  let tradeType = swingConf?"SWING":dayConf?"DAY":"SCALP";

  return { signal, confidence:conf, winrate:wr, total, bull, bear, tradeType };
}

// ==============================
// MAIN: analyzeMarket v6
// ==============================
async function analyzeMarket(symbol) {
  let pair=symbol==="GOLD"?"ETHUSDT":symbol+"USDT";

  // Fetch 6 TF พร้อมกัน (M1→1D)
  let [c15m,c5m,c1m,c1h,c4h,c1d]=await Promise.all([
    fetchCandles(pair,"15m",100),
    fetchCandles(pair,"5m", 60),
    fetchCandles(pair,"1m", 30),
    fetchCandles(pair,"1h", 60),
    fetchCandles(pair,"4h", 50),
    fetchCandles(pair,"1d", 30)
  ]);

  let candles=c15m;
  if(!candles||candles.length<30) return {error:"No Data"};

  let price  =candles[candles.length-1].close;
  let atr    =calcATR(candles);
  let rsiVal =calcRSI(c5m&&c5m.length>14?c5m:candles); // RSI จาก 5m เร็วกว่า
  let macdVal=calcMACD(candles);

  // SMC + Wyckoff จาก ai.js (เรียกครั้งเดียว)
  let smcR=smcScore(candles), wyR=wyckoffScore(candles);

  // 6 Layers
  let L1=multiTFTrend(c1m,c5m,c15m,c1h,c4h,c1d);
  let L2=momentumPrecision(rsiVal,macdVal,c5m&&c5m.length>3?c5m:candles,c5m);
  let L3=precisionCandle(c1m,c5m);
  let L4=volumeConviction(candles,c5m,c1m);
  let L5=structureSMC(c5m,candles,c1h,smcR,wyR);
  let L6=predictiveEngine(candles,c5m,c1m,c1h);

  // Session
  let hour=new Date().getUTCHours(), good=hour>=7&&hour<=21;
  let session=(hour>=13&&hour<=17)?"LONDON_NY":(hour>=7&&hour<=11)?"LONDON_OPEN":(hour>=18&&hour<=21)?"NEW_YORK":"ASIA";

  let layerScores={
    trend:    L1.score,
    momentum: L2.score,
    candle:   L3.score,
    volume:   L4.score,
    structure:good?L5.score:Math.round(L5.score*0.6),
    predictive:L6.score
  };

  let dec=confluenceDecision(layerScores,L2.urgency,L1.aligned,L1.d1h,L1.d4h);
  let ttp=tripleTP(candles,c5m,c1h,dec.signal,atr);
  let sr =detectSR(candles);
  let vwap=average(candles.map(c=>c.close));

  // FVG
  let fvg="NONE";
  let fs2=c5m&&c5m.length>=3?c5m:candles;
  let f1=fs2[fs2.length-3],f3=fs2[fs2.length-1];
  if(f3.low>f1.high)fvg="BULLISH"; if(f3.high<f1.low)fvg="BEARISH";

  let liq=smcR.zone==="DISCOUNT"?"BUY ZONE":smcR.zone==="PREMIUM"?"SELL ZONE":"NEUTRAL";

  // Default SL/TP
  let slD=dec.signal==="SELL"?(price+atr).toFixed(2):(price-atr).toFixed(2);
  let tp1D=dec.signal==="SELL"?(price-atr*1.5).toFixed(2):(price+atr*1.5).toFixed(2);
  let tp2D=dec.signal==="SELL"?(price-atr*3.5).toFixed(2):(price+atr*3.5).toFixed(2);
  let tp3D=dec.signal==="SELL"?(price-atr*6.0).toFixed(2):(price+atr*6.0).toFixed(2);

  return {
    symbol,
    price:      price.toFixed(2),
    signal:     dec.signal,
    confidence: dec.confidence,
    winrate:    dec.winrate,
    trade_type: dec.tradeType,          // SCALP/DAY/SWING
    trend:      L1.label,
    multitf:    `${L1.aligned}/6 TF`,
    rsi:        rsiVal,
    macd:       macdVal>0?"CROSS UP":"CROSS DOWN",
    pattern:    L3.trigger!=="NONE"?L3.trigger:L6.direction,
    volume:     L4.state,
    liquidity:  liq,
    orderblock: smcR.score>=3?"STRONG":"WEAK",
    fvg,
    entry:      price.toFixed(2),
    stoploss:   ttp?ttp.sl:slD,
    // TP1=Scalp, TP2=Day, TP3=Swing
    takeprofit: ttp?ttp.tp1:tp1D,
    tp2:        ttp?ttp.tp2:tp2D,
    tp3:        ttp?ttp.tp3:tp3D,
    tp1_pts:    ttp?`+${ttp.tp1Pts}`:"-",
    tp2_pts:    ttp?`+${ttp.tp2Pts}`:"-",
    tp3_pts:    ttp?`+${ttp.tp3Pts}`:"-",
    sl_pts:     ttp?`-${ttp.slPts}`:"-",
    rr1:        ttp?`1:${ttp.rr1}`:"-",
    rr2:        ttp?`1:${ttp.rr2}`:"-",
    rr3:        ttp?`1:${ttp.rr3}`:"-",
    predict:    L6.direction,
    pred_str:   L6.strength,
    pred_sig:   L6.signals.slice(0,3).join(", ")||"SCANNING",
    velocity:   ttp?ttp.velocity:"0",
    support:    sr.support.toFixed(2),
    resistance: sr.resistance.toFixed(2),
    vwap:       vwap.toFixed(2),
    atr:        atr.toFixed(4),
    session,
    wyckoff:    wyR.phase||"UNKNOWN"
  };
}

// ==============================
// API
// ==============================

server.post("/close-trade", (req, res) => {
  let { pattern, result } = req.body;
  if (!pattern || !["WIN", "LOSS"].includes(result)) {
    return res.status(400).json({ error: "ต้องส่ง pattern และ result (WIN/LOSS)" });
  }
  let ok = closeTrade(pattern, result);
  res.json({ success: ok, pattern, result });
});

server.get("/ai", async (req,res) => {
  try {
    let [btc,gold]=await Promise.all([analyzeMarket("BTC"),analyzeMarket("GOLD")]);
    res.json({btc,gold});
  } catch(e) { res.status(500).json({error:"API ERROR"}); }
});

server.get("/", (req,res) => res.sendFile(path.join(__dirname,"index.html")));
server.listen(3000, () => {
  console.log("------------------------------");
  console.log("🚀 NTW AI PRO v6.0 PORT 3000");
  console.log("------------------------------");
});