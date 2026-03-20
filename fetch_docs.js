const { chromium } = require('playwright');
const fs = require('fs');

async function fetchDoc(page, id) {
  const url = `https://developer.work.weixin.qq.com/document/path/${id}`;
  console.log(`Fetching ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });
  // Give it a moment to render any dynamic content
  await page.waitForTimeout(2000);
  
  // Try to extract the main content area. Usually it's in a specific div.
  // The developer center usually has a main container with class 'markdown-body' or similar.
  // If not, we fall back to grabbing all paragraph and pre elements.
  const content = await page.evaluate(() => {
    const article = document.querySelector('.article-content') || document.querySelector('.markdown-body') || document.body;
    return article ? article.innerText : 'Content not found';
  });
  
  fs.writeFileSync(`/root/geminiwecom/doc_${id}.txt`, `--- DOC ID: ${id} ---\n${content}\n\n`);
  console.log(`Saved doc_${id}.txt`);
}

async function main() {
  const ids = ['101039', '100719', '101027', '101031', '101032', '101033', '101138', '101463', '101468'];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  for (const id of ids) {
    try {
      await fetchDoc(page, id);
    } catch (e) {
      console.error(`Error fetching ${id}:`, e.message);
    }
  }
  
  await browser.close();
}

main();
