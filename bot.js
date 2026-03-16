// ==============================
// BOT ENGINE
// ==============================

const {aiAnalyze} = require("./app")
const {openTrade} = require("./trade")

function botLoop(market){

let result = aiAnalyze(market)

console.log("AI:",result)

if(result.signal==="BUY"){
openTrade("BUY",market.price)
}

if(result.signal==="SELL"){
openTrade("SELL",market.price)
}

}

module.exports={
botLoop
}