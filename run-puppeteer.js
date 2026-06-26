import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
  
  await page.goto('http://localhost:8080/test-insert.html');
  await page.waitForTimeout(5000); // Wait for async operations
  await browser.close();
})();
