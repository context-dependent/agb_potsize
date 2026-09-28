import { DICT4 } from './aruco';

export const SAMPLE_NAMES = ['Celadon vase', 'Mug', 'Tenmoku bowl'];

/**
 * Synthetic photo booth scene: three pieces on the marker line plus an 80 mm ID 7 marker card.
 * True sizes (W×H mm): vase 120×160, mug 105×95 (with handle), bowl 150×70.
 */
export function makeSample(): HTMLCanvasElement {
  const W=1800,H=1200,s=3,floorY=1010; // px per mm on the marker line
  const c=document.createElement('canvas'); c.width=W; c.height=H; const g=c.getContext('2d')!;
  let gr=g.createLinearGradient(0,0,0,H); gr.addColorStop(0,'#1f4f98'); gr.addColorStop(.75,'#2b62b3'); gr.addColorStop(1,'#3a73c2');
  g.fillStyle=gr; g.fillRect(0,0,W,H);
  gr=g.createRadialGradient(W*.45,H*.5,100,W*.45,H*.5,W*.8); gr.addColorStop(0,'rgba(255,255,255,.06)'); gr.addColorStop(1,'rgba(0,0,0,.18)');
  g.fillStyle=gr; g.fillRect(0,0,W,H);
  const smooth=(arr: number[][],cont?: boolean)=>{ cont?g.lineTo(arr[0][0],arr[0][1]):g.moveTo(arr[0][0],arr[0][1]);
    for(let i=1;i<arr.length-1;i++){ const mx=(arr[i][0]+arr[i+1][0])/2,my=(arr[i][1]+arr[i+1][1])/2; g.quadraticCurveTo(arr[i][0],arr[i][1],mx,my); }
    g.lineTo(arr[arr.length-1][0],arr[arr.length-1][1]); };
  const shade=(cx: number,rmax: number,cols: string[])=>{ const q=g.createLinearGradient(cx-rmax*s,0,cx+rmax*s,0); cols.forEach((c,i)=>q.addColorStop(i/(cols.length-1),c)); return q; };
  function pot(cx: number,prof: number[][],glaze: string[],foot: string[],inner: string){
    const rmax=Math.max(...prof.map(p=>p[1])), top=floorY-prof[prof.length-1][0]*s, rTop=prof[prof.length-1][1];
    g.save(); g.filter='blur(8px)'; g.fillStyle='rgba(0,20,60,.3)'; g.beginPath(); g.ellipse(cx,floorY+3,rmax*s*.9,10,0,0,Math.PI*2); g.fill(); g.restore();
    const R=prof.map(([y,r])=>[cx+r*s,floorY-y*s]), Lf=prof.slice().reverse().map(([y,r])=>[cx-r*s,floorY-y*s]);
    g.save(); g.beginPath(); smooth(R); smooth(Lf,true); g.closePath(); g.fillStyle=shade(cx,rmax,glaze); g.fill(); g.clip();
    g.fillStyle=shade(cx,rmax,foot); g.beginPath(); g.moveTo(0,floorY-8*s); for(let x=0;x<=W;x+=20) g.lineTo(x,floorY-8*s+Math.sin(x/37)*4); g.lineTo(W,H); g.lineTo(0,H); g.fill();
    g.restore();
    const ry=Math.max(5,rTop*s*.12); g.fillStyle=inner; g.beginPath(); g.ellipse(cx,top+ry+1,rTop*s*.94,ry,0,0,Math.PI*2); g.fill();
  }
  // vase 120 wide, 160 tall
  pot(260,[[0,28],[4,30],[12,40],[32,54],[55,60],[76,58],[98,48],[120,32],[134,24],[148,26],[157,31],[160,32]],
      ['#5d6a3a','#b8b57a','#d9d2a0','#4a5230'],['#7d5b40','#c99a72','#644631'],'#2f2a1c');
  // mug: body 80 wide, 95 tall, handle to the right reaching 105 total width
  const mx=640;
  g.strokeStyle='#d7d0c0'; g.lineWidth=7*s; g.lineCap='round';
  g.beginPath(); g.moveTo(mx+36*s,floorY-72*s); g.bezierCurveTo(mx+68*s,floorY-72*s,mx+68*s,floorY-24*s,mx+36*s,floorY-24*s); g.stroke();
  pot(mx,[[0,36],[3,38],[8,40],[50,40],[90,40],[95,40]],['#b9b1a0','#efe8d8','#f7f2e6','#a39b8a'],['#8d6d52','#c79c78','#6f533e'],'#6b6255');
  // bowl 150 wide, 70 tall
  pot(1090,[[0,28],[3,30],[8,36],[22,54],[40,66],[58,73],[70,75]],['#1c120c','#5a3a24','#7a4f30','#150d08'],['#6f533e','#b38a66','#5a4230'],'#140c07');
  // marker card on a stand, same line, slightly rotated
  const cardW=100*s, cardH=122*s, ccx=1560, ccy=floorY-60*s-cardH/2;
  g.fillStyle='#2a2a2a'; g.fillRect(ccx-5,ccy+cardH/2-10,10,floorY-(ccy+cardH/2)+2); g.fillRect(ccx-55,floorY-9,110,10);
  g.save(); g.translate(ccx,ccy); g.rotate(-2.5*Math.PI/180);
  g.fillStyle='#f4f4f1'; g.fillRect(-cardW/2,-cardH/2,cardW,cardH);
  const ms=80*s, cell=ms/6, mx0=-ms/2, my0=-cardH/2+10*s, code=DICT4[7];
  g.fillStyle='#111'; g.fillRect(mx0,my0,ms,ms); g.fillStyle='#f4f4f1';
  for(let r=0;r<4;r++) for(let cc=0;cc<4;cc++) if((code>>(15-(r*4+cc)))&1) g.fillRect(mx0+(cc+1)*cell,my0+(r+1)*cell,cell+.5,cell+.5);
  g.fillStyle='#333'; g.font=`600 ${Math.round(6*s)}px system-ui,sans-serif`; g.textAlign='center';
  g.fillText('↑ UP · ID 7 · 80 mm',0,cardH/2-9*s);
  g.restore();
  const im=g.getImageData(0,0,W,H), d=im.data; let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  for(let i=0;i<d.length;i+=4){ const n=(rnd()-.5)*10; d[i]+=n; d[i+1]+=n; d[i+2]+=n; }
  g.putImageData(im,0,0);
  return c;
}
