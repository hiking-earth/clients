// Free CPU backend is the default. External providers require explicit opt-in.
exports.main=async event=>{
 if(process.env.GEAR_SCAN_BACKEND==='external')return require('./provider.cjs').main(event);
 try{return await require('./local-cpu.cjs').main(event);}catch{return {errMsg:'免费识别服务暂不可用，请稍后重试'};}
};
