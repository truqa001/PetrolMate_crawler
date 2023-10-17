import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import { CITIES } from './city-latitudes.mjs';
import { FUEL_TYPES } from './fuel-types.mjs';

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-infobars',
    '--window-position=0,0',
    '--ignore-certifcate-errors',
    '--ignore-certifcate-errors-spki-list',
    '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36"'
];


(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        ...args
    });
    const page = await browser.newPage();
    page.setViewport({ width: 1280, height: 720 });

    const data = await appendFuelStationsGroupedByCity(page);

    await browser.close();
})();

async function appendFuelStationsGroupedByCity(page) {
    let result = {}
    let fuelTypeData = {};
    for (const cityKey of Object.keys(CITIES)) {
        for (const fuelTypeKey of Object.keys(FUEL_TYPES)) {
            const stationData = await getFuelStationsData(page, CITIES[cityKey], FUEL_TYPES[fuelTypeKey])
            fuelTypeData = {
                ...fuelTypeData,
                [FUEL_TYPES[fuelTypeKey]]: [...stationData]
            }
        }

        result = {
            ...result,
            [cityKey]: {
                ...fuelTypeData
            }
        }
    }
    return result
}


async function getFuelStationsData(page, city, fuelType) {
    const stationData = [];

    await page.goto(`https://petrolspy.com.au/map/latlng/${city}`, {
        waitUntil: 'networkidle2',
        timeout: 120000
    });

    await page.click('#fuel-dropdown');
    await page.waitForSelector('.dropDownOptionsDiv');
    await page.click(`#option_${fuelType}`);

    for (let i = 0; i < 3; i++) {
        await page.click('.maplibregl-ctrl-zoom-out');
        if (i < 2) {
            await page.waitForTimeout(1000);
        }
    }

    await page.click('#list-view');

    await page.waitForSelector('.stations-list-item');

    const stationItemElements = await page.$$('.stations-list-item');

    for (const stationItemElement of stationItemElements) {
        const stationDetails = await getStationDetails(stationItemElement)
        stationData.push(stationDetails)
    }

    return stationData;
}

async function getStationDetails(stationItemElement) {
    const priceElement = await stationItemElement.$('.stations-item-column-first b');

    if (priceElement) {
        const price = await stationItemElement.$eval('.stations-item-column-first b', b => b.textContent)
        const stationItemMidColText = await stationItemElement.$eval('.stations-item-column-middle', el => el.textContent);
        const trimmedStationItemMidColTextArray = stationItemMidColText.split('\n')
            .map(line => line.trim())
            .filter(line => line !== '');
        const stationName = trimmedStationItemMidColTextArray[0];
        const address = trimmedStationItemMidColTextArray[1] + ', ' + trimmedStationItemMidColTextArray[2];
        const imageSrc = await stationItemElement.$eval('.stations-item-column-first img', el => el.getAttribute('src'));

        return {
            stationName,
            address,
            price,
            logo: imageSrc,
        }
    }
}