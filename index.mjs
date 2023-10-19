import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import { CITY_LATITUDES } from './city-latitudes.mjs';
import { FUEL_TYPES } from './fuel-types.mjs';
import { FirebaseDB } from './firebase-config.mjs';
import _ from 'lodash';

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

    await saveFuelStationsData(browser, page);
    await browser.close();

})();

async function saveFuelStationsData(browser, page) {
    for (const cityKey of Object.keys(CITY_LATITUDES)) {
        for (const fuelTypeKey of Object.keys(FUEL_TYPES)) {
            const stationData = await getFuelStationsData(page, CITY_LATITUDES[cityKey], FUEL_TYPES[fuelTypeKey])

            const root = '/City';
            const ref = FirebaseDB.ref(`${root}/${cityKey}/${FUEL_TYPES[fuelTypeKey]}`);

            try {
                await ref.set(stationData);
                console.log('Data saved successfully');
            } catch (error) {
                console.error('Error: ' + error);
            }
        }

    }
}


async function getFuelStationsData(page, city, fuelType) {
    const stationsData = [];

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

        if (stationDetails) {
            stationsData.push(stationDetails)
        }
    }

    const minPrice = _.min(stationsData.map(station => station.price));
    const maxPrice = _.max(stationsData.map(station => station.price));

    return {
        stations: [...stationsData],
        minPrice,
        maxPrice
    };
}

async function getStationDetails(stationItemElement) {
    const firstColumnHTML = await stationItemElement.$eval('.stations-item-column-first', el => el.textContent);
    const priceMatch = firstColumnHTML.match(/(\d+\.\d+)/); // Match the price (assuming it's a decimal number)
    const price = priceMatch ? priceMatch[0] : null;

    if (price) {
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