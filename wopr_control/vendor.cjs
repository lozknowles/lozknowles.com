const fs=require('fs'),path=require('path');
const dst=path.join(__dirname,'web/vendor');fs.mkdirSync(dst,{recursive:true});
for(const [pkg,src,out] of [['@xterm/xterm','lib/xterm.js','xterm.js'],['@xterm/xterm','css/xterm.css','xterm.css'],['@xterm/addon-fit','lib/addon-fit.js','fit.js'],['@xterm/xterm','LICENSE','xterm-LICENSE'],['@xterm/addon-fit','LICENSE','fit-LICENSE']])fs.copyFileSync(path.join(__dirname,'node_modules',pkg,src),path.join(dst,out));
