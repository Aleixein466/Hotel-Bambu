import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser=await chromium.launch();
await mkdir('artifacts',{recursive:true});
for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5173/');
  await page.screenshot({path:`artifacts/${name}-hero.png`});
  await page.addStyleTag({content:'html { scroll-behavior: auto !important; }'});
  await page.evaluate(async()=>{
    for(let y=0;y<document.body.scrollHeight;y+=window.innerHeight){window.scrollTo(0,y);await new Promise(resolve=>setTimeout(resolve,130));}
    window.scrollTo({top:0,behavior:'instant'});
  });
  await page.waitForFunction(()=>window.scrollY===0);
  await page.waitForTimeout(350);
  await page.screenshot({path:`artifacts/${name}.png`,fullPage:true});
  await page.close();
}
await browser.close();
