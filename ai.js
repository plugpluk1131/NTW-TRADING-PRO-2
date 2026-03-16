// ==============================
// NTW AI PRO ENGINE
// ==============================

const fs = require("fs");

// ------------------------------
// MEMORY (แก้ไขใหม่ใช้ fs)
// ------------------------------
let tradeMemory = [];

function loadMemory() {
  try {
    if (fs.existsSync("memory.json")) {
      let data = fs.readFileSync("memory.json", "utf8");
      tradeMemory = JSON.parse(data);
      console.log("✅ AI Memory Loaded");
    }
  } catch (e) {
    tradeMemory = [];
  }
}

function saveMemory() {
  try {
    fs.writeFileSync("memory.json", JSON.stringify(tradeMemory, null, 2));
  } catch (e) {
    if (tradeMemory.length > 0) tradeMemory.shift();
  }
}

// เรียกใช้งานตอนโหลดไฟล์
loadMemory();

function logTrade(info){

tradeMemory.push(info)

if(tradeMemory.length > 1000){
tradeMemory.shift()
}

saveMemory()

}

loadMemory()

// ------------------------------
// AI LEARNING
// ------------------------------

function learnTrade(pattern,result){

if(!pattern) return

logTrade({

pattern:pattern,
result:result,
time:Date.now()

})

}

// ------------------------------
// UTILS
// ------------------------------

function average(arr){

if(!arr || arr.length===0) return 0

return arr.reduce((a,b)=>a+b,0)/arr.length

}

function stddev(arr){

if(!arr || arr.length===0) return 0

let avg = average(arr)

let squareDiffs = arr.map(v=>{
let diff = v-avg
return diff*diff
})

return Math.sqrt(average(squareDiffs))

}

// ------------------------------
// VOLATILITY
// ------------------------------

function calcATR(candles,period=14){

if(!candles || candles.length < period+1) return 0

let trs=[]

for(let i=candles.length-period;i<candles.length;i++){

let c = candles[i]
let prev = candles[i-1]

let tr = Math.max(
c.high - c.low,
Math.abs(c.high - prev.close),
Math.abs(c.low - prev.close)
)

trs.push(tr)

}

return average(trs)

}

// ------------------------------
// MARKET STRUCTURE
// ------------------------------

function marketStructure(candles){

if(!candles || candles.length < 5) return "NONE"

let a=candles[candles.length-5]
let b=candles[candles.length-3]
let c=candles[candles.length-1]

if(c.high>b.high && b.high>a.high)
return "HH"

if(c.low<b.low && b.low<a.low)
return "LL"

if(c.high<b.high)
return "LH"

if(c.low>b.low)
return "HL"

return "RANGE"

}

// ------------------------------
// CANDLE PSYCHOLOGY
// ------------------------------

function candlePsychology(candle){

if(!candle) return "NORMAL"

let body=Math.abs(candle.close-candle.open)
let range=candle.high-candle.low

if(range===0) return "NORMAL"

let upper=candle.high-Math.max(candle.close,candle.open)
let lower=Math.min(candle.close,candle.open)-candle.low

if(lower>body*2) return "HAMMER"

if(upper>body*2) return "SHOOTING_STAR"

if(body<range*0.2) return "DOJI"

if(body>range*0.8) return "MARUBOZU"

return "NORMAL"

}

// ------------------------------
// SUPPORT RESISTANCE
// ------------------------------

function detectSR(candles){

if(!candles || candles.length < 50){

let last=candles[candles.length-1]

return {
support:last.low,
resistance:last.high
}

}

let highs=candles.slice(-50).map(c=>c.high)
let lows=candles.slice(-50).map(c=>c.low)

return {

support:Math.min(...lows),
resistance:Math.max(...highs)

}

}

// ------------------------------
// DOUBLE TOP
// ------------------------------

function doubleTop(candles){

if(!candles || candles.length < 30) return false

let highs=candles.slice(-30).map(c=>c.high)

let max=Math.max(...highs)

let near=highs.filter(
h=>Math.abs(h-max)<(max*0.002)
)

return near.length>=2

}

// ------------------------------
// DOUBLE BOTTOM
// ------------------------------

function doubleBottom(candles){

if(!candles || candles.length < 30) return false

let lows=candles.slice(-30).map(c=>c.low)

let min=Math.min(...lows)

let near=lows.filter(
l=>Math.abs(l-min)<(min*0.002)
)

return near.length>=2

}

// ------------------------------
// LIQUIDITY SWEEP
// ------------------------------

function liquiditySweep(candles){

if(!candles || candles.length < 5) return "NONE"

let last=candles[candles.length-1]
let prev=candles[candles.length-2]

if(last.high>prev.high && last.close<prev.high)
return "BUY_SWEEP"

if(last.low<prev.low && last.close>prev.low)
return "SELL_SWEEP"

return "NONE"

}

// ------------------------------
// ORDERBLOCK STRENGTH
// ------------------------------

function orderblockStrength(candles){

if(!candles || candles.length < 20) return 0

let moves=[]

for(let i=candles.length-10;i<candles.length;i++){

let c=candles[i]

moves.push(Math.abs(c.close-c.open))

}

return average(moves)

}

// ------------------------------
// VOLUME ANALYSIS
// ------------------------------

function volumeAnalysis(volumes){

if(!volumes || volumes.length < 20) return "NORMAL"

let avg=average(volumes.slice(-20))

let last=volumes[volumes.length-1]

if(last>avg*2) return "SPIKE"

if(last<avg*0.5) return "DRY"

return "NORMAL"

}

// ------------------------------
// PATTERN WINRATE MEMORY
// ------------------------------

function patternWinrate(pattern){

let trades=tradeMemory.filter(
t=>t.pattern===pattern
)

if(trades.length<20) return 50

let wins=trades.filter(
t=>t.result==="WIN"
).length

return (wins/trades.length)*100

}

// ------------------------------
// AI DECISION ENGINE
// ------------------------------

function aiAnalyze(data){

let {
rsi,
macd,
trend,
pattern,
liquidity,
volume,
candles,
volumes,
bid,
ask
}=data

if(!candles || candles.length===0){
return {
signal:"HOLD",
confidence:40,
winrate:50
}
}

let score=0

let spread = spreadFilter(bid,ask)

if(spread==="WIDE")
score-=3

let atr = calcATR(candles)

let volatility = atr

let sr = detectSR(candles)

let price = candles[candles.length-1].close
if(price <= sr.support*1.002)
score+=2

if(price >= sr.resistance*0.998)
score-=3

let trendPower = trendStrength(candles)

let div = rsiDivergence(candles,rsi)

let session = tradingSession()

let vwap = calcVWAP(candles)

let liqPool = liquidityPool(candles)

let momTrend = trendMomentum(candles)

if(trendExhaustion(candles))
score-=1

let brk = breakout(candles)

let fake = fakeBreakout(candles)

let volState = volatilityState(candles)

let flow = orderFlow(volumes)

if(volState==="LOW" && volume==="DRY"){
return {
signal:"HOLD",
confidence:40,
winrate:50
}
}

let quality = tradeQuality(score,volume,volatility)

score += quality*0.2

// RSI

if(rsi<30) score+=2
if(rsi>70) score-=2

// MACD

if(macd>0) score+=1
if(macd<0) score-=1

// TREND POWER

if(trendPower>0) score+=2
if(trendPower<0) score-=2

// TREND

if(trend==="UPTREND") score+=2
if(trend==="DOWNTREND") score-=2

// PATTERN

if(pattern==="BREAKOUT") score+=2
if(pattern==="BREAKDOWN") score-=2

// VOLUME

if(volume==="SPIKE") score+=1

// SESSION BOOST

if(session==="LONDON") score+=1
if(session==="NEWYORK") score+=1

// LIQUIDITY

if(liquidity==="BUY SIDE") score+=1
if(liquidity==="SELL SIDE") score-=1

// MARKET STRUCTURE

let structure=marketStructure(candles)

if(structure==="HH") score+=2
if(structure==="LL") score-=2

// DIVERGENCE

if(div==="BULL_DIV") score+=3
if(div==="BEAR_DIV") score-=3

// DOUBLE PATTERNS

if(doubleBottom(candles)) score+=3
if(doubleTop(candles)) score-=3

// LIQUIDITY SWEEP

let sweep=liquiditySweep(candles)

if(sweep==="SELL_SWEEP") score+=2
if(sweep==="BUY_SWEEP") score-=2

// PSYCHOLOGY

let last=candles[candles.length-1]

let psy=candlePsychology(last)

if(psy==="HAMMER") score+=2
if(psy==="SHOOTING_STAR") score-=2

// PATTERN MEMORY

let pWin=patternWinrate(pattern)

if(pWin>70) score+=2
if(pWin<40) score-=2

// VWAP

if(price>vwap) score+=1
if(price<vwap) score-=1

// MOMENTUM TREND

if(momTrend==="BULL") score+=2
if(momTrend==="BEAR") score-=2

// BREAKOUT

if(brk==="BREAKOUT") score+=3
if(brk==="BREAKDOWN") score-=3

// FAKE BREAKOUT

if(fake==="FAKE_UP")
score-=2

if(fake==="FAKE_DOWN")
score+=2

// LIQUIDITY POOL

if(liqPool==="SELL_LIQUIDITY") score+=2
if(liqPool==="BUY_LIQUIDITY") score-=2

// ORDER FLOW

if(flow==="BUY_PRESSURE") score+=2
if(flow==="SELL_PRESSURE") score-=2

// VOLATILITY FILTER

if(volState==="LOW") score-=1
if(volState==="HIGH") score+=1

// FINAL SIGNAL

let signal="HOLD"

if(score>=4) signal="BUY"
if(score<=-4) signal="SELL"

// CONFIDENCE

let trendBoost = Math.max(-5,Math.min(5,trendPower*10))

let confidence = Math.min(
95,
50 + Math.abs(score)*5 + (pWin*0.25) + trendBoost
)

// CONFIDENCE BOOST

if(score>=6) confidence+=5

if(score>=8) confidence+=5

confidence = Math.min(confidence,95)

// WINRATE ESTIMATE

let winrate=50+Math.abs(score)*5

if(winrate>95) winrate=95

return{
signal,
confidence:Math.round(confidence),
winrate:Math.round(winrate)
}

}

// ------------------------------
// EMA
// ------------------------------

function ema(values,period){

let k = 2/(period+1)
let ema = values[0]

for(let i=1;i<values.length;i++){

ema = values[i]*k + ema*(1-k)

}

return ema

}

// ------------------------------
// TREND STRENGTH
// ------------------------------

function trendStrength(candles){

if(candles.length<50) return 0

let closes = candles.map(c=>c.close)

let ema20 = ema(closes.slice(-20),20)
let ema50 = ema(closes.slice(-50),50)

let diff = ema20-ema50

return diff

}

// ------------------------------
// RSI DIVERGENCE
// ------------------------------

function rsiDivergence(candles,rsi){

if(candles.length<10) return "NONE"

let last=candles[candles.length-1]
let prev=candles[candles.length-5]

if(last.low<prev.low && rsi>35)
return "BULL_DIV"

if(last.high>prev.high && rsi<65)
return "BEAR_DIV"

return "NONE"

}

// ------------------------------
// SESSION
// ------------------------------

function tradingSession(){

let hour = new Date().getUTCHours()

if(hour>=12 && hour<=16)
return "LONDON"

if(hour>=17 && hour<=22)
return "NEWYORK"

return "ASIA"

}

// ------------------------------
// TRADE QUALITY
// ------------------------------

function tradeQuality(score,volume,volatility){

let quality = score

if(volume==="SPIKE") quality+=2

if(volatility>0) quality+=1

return quality

}

// ------------------------------
// VWAP
// ------------------------------

function calcVWAP(candles){

let pv = 0
let volume = 0

for(let c of candles){

let price = (c.high+c.low+c.close)/3

pv += price*(c.volume||1)
volume += (c.volume||1)

}

if(volume===0) return 0

return pv/volume

}

// ------------------------------
// LIQUIDITY POOL
// ------------------------------

function liquidityPool(candles){

if(candles.length<20) return "NONE"

let highs = candles.slice(-20).map(c=>c.high)
let lows = candles.slice(-20).map(c=>c.low)

let max = Math.max(...highs)
let min = Math.min(...lows)

let last = candles[candles.length-1]

if(Math.abs(last.high-max) < max*0.001)
return "BUY_LIQUIDITY"

if(Math.abs(last.low-min) < min*0.001)
return "SELL_LIQUIDITY"

return "NONE"

}

// ------------------------------
// MOMENTUM
// ------------------------------

function momentum(candles){

if(candles.length<10) return 0

let last = candles[candles.length-1].close
let prev = candles[candles.length-10].close

return last-prev

}

// ------------------------------
// TREND MOMENTUM
// ------------------------------

function trendMomentum(candles){

let mom = momentum(candles)

if(mom>0) return "BULL"

if(mom<0) return "BEAR"

return "FLAT"

}

// ------------------------------
// TREND EXHAUSTION
// ------------------------------

function trendExhaustion(candles){

if(candles.length<15) return false

let last = candles[candles.length-1]
let prev = candles[candles.length-10]

let move = Math.abs(last.close-prev.close)

let range = last.high-last.low

if(move < range*2)
return true

return false

}

// ------------------------------
// BREAKOUT
// ------------------------------

function breakout(candles){

if(candles.length<20) return "NONE"

let highs=candles.slice(-20).map(c=>c.high)
let lows=candles.slice(-20).map(c=>c.low)

let resistance=Math.max(...highs)
let support=Math.min(...lows)

let last=candles[candles.length-1]

if(last.close>resistance)
return "BREAKOUT"

if(last.close<support)
return "BREAKDOWN"

return "NONE"

}

// ------------------------------
// FAKE BREAKOUT
// ------------------------------

function fakeBreakout(candles){

if(candles.length<10) return "NONE"

let last = candles[candles.length-1]
let prev = candles[candles.length-2]

if(last.high>prev.high && last.close<prev.close)
return "FAKE_UP"

if(last.low<prev.low && last.close>prev.close)
return "FAKE_DOWN"

return "NONE"

}

// ------------------------------
// VOLATILITY FILTER
// ------------------------------

function volatilityState(candles){

let atr = calcATR(candles)

if(atr===0) return "LOW"

if(atr>candles[candles.length-1].close*0.005)
return "HIGH"

return "NORMAL"

}

// ------------------------------
// ORDER FLOW
// ------------------------------

function orderFlow(volumes){

if(volumes.length<10) return "NEUTRAL"

let last = volumes.slice(-10)

let avg = average(last)

let current = last[last.length-1]

if(current > avg*1.3)
return "BUY_PRESSURE"

if(current < avg*0.7)
return "SELL_PRESSURE"

return "NEUTRAL"

}

// ------------------------------
// SPREAD FILTER
// ------------------------------

function spreadFilter(bid,ask){

if(!bid || !ask) return "NORMAL"

let spread = ask-bid

if(spread > bid*0.001)
return "WIDE"

return "NORMAL"

}

// ==============================
// SMART MONEY CONCEPT (SMC)
// ==============================

// CHoCH - จุดกลับตัว
function detectCHoCH(candles){
  if(!candles || candles.length<10) return "NONE"
  let recent = candles.slice(-10)
  let hh = recent.slice(0,5).reduce((a,b)=>b.high>a.high?b:a)
  let ll = recent.slice(5).reduce((a,b)=>b.low<a.low?b:a)
  if(ll.low<recent[0].low && hh.high>recent[0].high) return "BEARISH_CHOCH"
  let hl = recent.slice(0,5).reduce((a,b)=>b.low<a.low?b:a)
  let hh2 = recent.slice(5).reduce((a,b)=>b.high>a.high?b:a)
  if(hh2.high>recent[0].high && hl.low<recent[0].low) return "BULLISH_CHOCH"
  return "NONE"
}

// BOS - ยืนยัน Trend
function detectBOS(candles){
  if(!candles || candles.length<20) return "NONE"
  let prev = candles.slice(-20,-10)
  let curr = candles.slice(-10)
  let prevHigh = Math.max(...prev.map(c=>c.high))
  let prevLow  = Math.min(...prev.map(c=>c.low))
  let currHigh = Math.max(...curr.map(c=>c.high))
  let currLow  = Math.min(...curr.map(c=>c.low))
  let lastClose = candles[candles.length-1].close
  if(lastClose>prevHigh && currHigh>prevHigh) return "BULLISH_BOS"
  if(lastClose<prevLow  && currLow<prevLow)   return "BEARISH_BOS"
  return "NONE"
}

// Premium/Discount Zone
function premiumDiscountZone(candles){
  if(!candles || candles.length<50) return "NONE"
  let high = Math.max(...candles.slice(-50).map(c=>c.high))
  let low  = Math.min(...candles.slice(-50).map(c=>c.low))
  let range = high-low
  if(range===0) return "NONE"
  let price = candles[candles.length-1].close
  let position = (price-low)/range
  if(position<0.35) return "DISCOUNT"
  if(position>0.65) return "PREMIUM"
  return "EQUILIBRIUM"
}

// FVG - ช่องว่างราคา
function detectFVG(candles){
  if(!candles || candles.length<5) return "NONE"
  let c1 = candles[candles.length-3]
  let c3 = candles[candles.length-1]
  if(c3.low>c1.high)  return "BULLISH_FVG"
  if(c3.high<c1.low)  return "BEARISH_FVG"
  return "NONE"
}

// Order Block Detection
function detectOrderBlock(candles){
  if(!candles || candles.length<20) return {type:"NONE",level:0}
  let bodies = candles.slice(-20).map(c=>Math.abs(c.close-c.open))
  let avgBody = average(bodies)
  for(let i=candles.length-2;i>=candles.length-15;i--){
    let c = candles[i]
    let body = Math.abs(c.close-c.open)
    if(body>avgBody*2){
      let prev = candles[i-1]
      if(c.close>c.open && prev.close<prev.open) return {type:"BULLISH_OB",level:prev.low}
      if(c.close<c.open && prev.close>prev.open) return {type:"BEARISH_OB",level:prev.high}
    }
  }
  return {type:"NONE",level:0}
}

// SMC Score รวม
function smcScore(candles){
  if(!candles || candles.length<20) return {score:0,choch:"NONE",bos:"NONE",fvg:"NONE",zone:"NONE"}
  let score = 0
  let choch = detectCHoCH(candles)
  let bos   = detectBOS(candles)
  let zone  = premiumDiscountZone(candles)
  let fvg   = detectFVG(candles)
  let ob    = detectOrderBlock(candles)
  if(choch==="BULLISH_CHOCH") score+=4
  if(choch==="BEARISH_CHOCH") score-=4
  if(bos==="BULLISH_BOS")     score+=3
  if(bos==="BEARISH_BOS")     score-=3
  if(zone==="DISCOUNT")       score+=3
  if(zone==="PREMIUM")        score-=3
  if(fvg==="BULLISH_FVG")     score+=2
  if(fvg==="BEARISH_FVG")     score-=2
  if(ob.type==="BULLISH_OB")  score+=3
  if(ob.type==="BEARISH_OB")  score-=3
  return {score,choch,bos,fvg,zone,ob}
}

// SMC Entry Point
function smcEntryPoint(candles,signal){
  if(!candles || candles.length<20) return null
  let price = candles[candles.length-1].close
  let atr   = calcATR(candles)
  let ob    = detectOrderBlock(candles)
  if(signal==="BUY"){
    let entry = ob.type==="BULLISH_OB" && ob.level>0 ? ob.level : price
    return {
      entry:      entry.toFixed(2),
      stoploss:   (entry-atr*1.5).toFixed(2),
      takeprofit: (entry+atr*3.0).toFixed(2),
      rr:"1:2"
    }
  }
  if(signal==="SELL"){
    let entry = ob.type==="BEARISH_OB" && ob.level>0 ? ob.level : price
    return {
      entry:      entry.toFixed(2),
      stoploss:   (entry+atr*1.5).toFixed(2),
      takeprofit: (entry-atr*3.0).toFixed(2),
      rr:"1:2"
    }
  }
  return null
}

// ==============================
// WYCKOFF ANALYSIS
// ==============================

function wyckoffPhase(candles){
  if(!candles || candles.length<50) return "UNKNOWN"
  let early  = candles.slice(0,17)
  let mid    = candles.slice(17,34)
  let recent = candles.slice(34,50)
  let earlyP  = average(early.map(c=>c.close))
  let midP    = average(mid.map(c=>c.close))
  let recentP = average(recent.map(c=>c.close))
  let earlyV  = average(early.map(c=>c.volume||1))
  let midV    = average(mid.map(c=>c.volume||1))
  let recentV = average(recent.map(c=>c.volume||1))
  if(earlyP>midP && midV<earlyV && recentV>midV && recentP>=midP)
    return "ACCUMULATION"
  if(recentP>midP && midP>earlyP && recentV>=midV*0.8)
    return "MARKUP"
  if(earlyP<midP && midV>earlyV && recentV<midV && recentP<=midP*1.01)
    return "DISTRIBUTION"
  if(recentP<midP && midP<earlyP)
    return "MARKDOWN"
  return "RANGING"
}

function wyckoffSpring(candles){
  if(!candles || candles.length<20) return false
  let lows   = candles.slice(-20).map(c=>c.low)
  let minLow = Math.min(...lows)
  let last   = candles[candles.length-1]
  let prev   = candles[candles.length-2]
  return(
    last.low < minLow &&
    last.close > prev.close &&
    last.close > last.open
  )
}

function wyckoffUpthrust(candles){
  if(!candles || candles.length<20) return false
  let highs   = candles.slice(-20).map(c=>c.high)
  let maxHigh = Math.max(...highs)
  let last    = candles[candles.length-1]
  let prev    = candles[candles.length-2]
  return(
    last.high > maxHigh &&
    last.close < prev.close &&
    last.close < last.open
  )
}

function wyckoffCause(candles){
  if(!candles || candles.length<30) return 0
  let prices = candles.slice(-30).map(c=>c.close)
  let max    = Math.max(...prices)
  let min    = Math.min(...prices)
  let range  = max-min
  if(range===0) return 0
  let std    = stddev(prices)
  let cause  = Math.max(0,100-(std/range*100))
  return Math.round(cause)
}

function wyckoffVolumeClimax(candles){
  if(!candles || candles.length<20) return "NONE"
  let volumes = candles.slice(-20).map(c=>c.volume||1)
  let avgVol  = average(volumes)
  let last    = candles[candles.length-1]
  let lastVol = last.volume||1
  if(lastVol > avgVol*3){
    if(last.close < last.open) return "SELLING_CLIMAX"
    if(last.close > last.open) return "BUYING_CLIMAX"
  }
  return "NONE"
}

function wyckoffScore(candles){
  if(!candles || candles.length<50){
    return {score:0,phase:"UNKNOWN",spring:false,upthrust:false,cause:0,climax:"NONE"}
  }
  let score    = 0
  let phase    = wyckoffPhase(candles)
  let spring   = wyckoffSpring(candles)
  let upthrust = wyckoffUpthrust(candles)
  let cause    = wyckoffCause(candles)
  let climax   = wyckoffVolumeClimax(candles)
  if(phase==="ACCUMULATION") score+=4
  if(phase==="MARKUP")       score+=3
  if(phase==="DISTRIBUTION") score-=4
  if(phase==="MARKDOWN")     score-=3
  if(spring)                 score+=5
  if(upthrust)               score-=5
  if(cause>70)               score+=2
  if(cause>85)               score+=2
  if(climax==="SELLING_CLIMAX") score+=3
  if(climax==="BUYING_CLIMAX")  score-=3
  return {score,phase,spring,upthrust,cause,climax}
}

// ------------------------------
// TREND PROBABILITY (High Performance)
// ------------------------------
function trendProbability(candles) {
  if (!candles || candles.length < 2) return 50;
  
  // ใช้ For Loop รอบเดียวเพื่อประสิทธิภาพสูงสุดในการคำนวณความน่าจะเป็นของเทรนด์
  let upMoves = 0;
  const len = candles.length;
  
  for (let i = 1; i < len; i++) {
    if (candles[i].close > candles[i - 1].close) {
      upMoves++;
    }
  }
  
  // คืนค่าเป็นเปอร์เซ็นต์ความแข็งแกร่งของฝั่งขาขึ้น
  return Math.round((upMoves / (len - 1)) * 100);
}

// ------------------------------
// LIQUIDITY ZONE (High Precision)
// ------------------------------
function liquidityZone(candles) {
  if (!candles || candles.length < 20) return { buy: 0, sell: 0 };
  
  // ค้นหาจุดสูงสุด/ต่ำสุดในช่วง 20 แท่งล่าสุด เพื่อหาโซนที่มี Liquidity หนาแน่น
  let maxHigh = -Infinity;
  let minLow = Infinity;
  
  const recentCandles = candles.slice(-20);
  for (const c of recentCandles) {
    if (c.high > maxHigh) maxHigh = c.high;
    if (c.low < minLow) minLow = c.low;
  }

  return {
    buy: minLow,   // โซน Sell-side Liquidity (คนตั้ง SL ฝั่ง Buy ไว้เยอะ)
    sell: maxHigh  // โซน Buy-side Liquidity (คนตั้ง SL ฝั่ง Sell ไว้เยอะ)
  };
}

// ------------------------------
// CLOSE TRADE (AI Learning Optimization)
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
  wyckoffScore
}






