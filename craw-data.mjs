import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import { CITY_COORDINATES } from './city-coordinates.mjs';
import { FUEL_TYPES } from './fuel-types.mjs';
import { FirebaseDB } from './firebase-config.mjs';
import _ from 'lodash';
import axios from 'axios';
import moment from 'moment';

export const crawData = (res) => {
  res.send('Crawling for data...');
  puppeteer.use(StealthPlugin());
  puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--single-process',
    '--no-zygote',
  ];

  main()
    .catch((e) => {
      console.error('Error:', e.message);
      process.exit(1);
    })
    .finally(() => {
      process.exit(0);
      res.send('Done');
    });

  async function main() {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath:
        process.env.NODE_ENV === 'production'
          ? process.env.PUPPETEER_EXECUTABLE_PATH
          : puppeteer.executablePath(),
      ...args,
    });
    const page = await browser.newPage();
    page.setViewport({ width: 1280, height: 720 });

    const startTime = moment();
    await saveFuelStationsData(page);
    const endTime = moment();

    const duration = moment.duration(endTime.diff(startTime));

    const ref = FirebaseDB.ref();
    await saveDataToFirebase(
      ref,
      {
        Updated: {
          at: moment().format('DD-MM-YYYY HH:mm:ss').toString(),
          duration: `${duration.hours()} hours and ${duration.minutes()} minutes`,
        },
      },
      'Timestamp is updated successfully',
    );

    await browser.close();
  }

  async function saveFuelStationsData(page) {
    for (const cityKey of Object.keys(CITY_COORDINATES)) {
      for (const fuelTypeKey of Object.keys(FUEL_TYPES)) {
        const stationData = await getFuelStationsData(
          page,
          CITY_COORDINATES[cityKey],
          FUEL_TYPES[fuelTypeKey],
        );

        const ref = FirebaseDB.ref(
          `/City/${cityKey}/${[FUEL_TYPES[fuelTypeKey]]}`,
        );
        saveDataToFirebase(
          ref,
          stationData,
          `Data saved successfully for City:${cityKey}, Fuel type: ${fuelTypeKey}`,
        );
      }
    }
  }

  async function getFuelStationsData(page, cityCoors, fuelType) {
    const stationsData = [];

    await page.goto(`https://petrolspy.com.au/map/latlng/${cityCoors}`, {
      waitUntil: 'networkidle2',
      timeout: 120000,
    });
    await page.waitForSelector('#fuel-dropdown');
    await page.click('#fuel-dropdown');
    await page.waitForSelector('.dropDownOptionsDiv');
    await page.click(`#option_${fuelType}`);

    for (let i = 0; i < 5; i++) {
      await page.click('.maplibregl-ctrl-zoom-out');
      if (i < 4) {
        await page.waitForTimeout(1000);
      }
    }

    await page.click('#list-view');

    await page.waitForSelector('.stations-list-item');

    const stationItemElements = await page.$$('.stations-list-item');

    for (const stationItemElement of stationItemElements) {
      const stationDetails = await getStationDetails(page, stationItemElement);

      if (stationDetails) {
        stationsData.push(stationDetails);
      }
    }

    const minPrice = _.min(stationsData.map((station) => station.price));
    const maxPrice = _.max(stationsData.map((station) => station.price));

    return {
      stations: [...stationsData],
      minPrice,
      maxPrice,
    };
  }

  async function getStationDetails(page, stationItemElement) {
    await page.waitForSelector('.stations-item-column-first');
    const firstColumnHTML = await stationItemElement.$eval(
      '.stations-item-column-first',
      (el) => el.textContent,
    );
    const priceMatch = firstColumnHTML.match(/(\d+\.\d+)/); // Match the price (assuming it's a decimal number)
    const price = priceMatch ? priceMatch[0] : null;

    if (price) {
      const stationItemMidColText = await stationItemElement.$eval(
        '.stations-item-column-middle',
        (el) => el.textContent,
      );

      const trimmedStationItemMidColTextArray = stationItemMidColText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');

      const stationName = trimmedStationItemMidColTextArray[0];
      const streetAddress = trimmedStationItemMidColTextArray[1];

      const suburb = await stationItemElement.$eval(
        '.stations-item-column-middle b:nth-of-type(2)',
        (el) => el.textContent,
      );

      const postcode = trimmedStationItemMidColTextArray
        .at(-1)
        .split(suburb)
        .at(-1)
        .trim();

      const fullAddress = `${streetAddress}, ${suburb}, ${postcode}`;

      const imageSrc = await stationItemElement.$eval(
        '.stations-item-column-first img',
        (el) => el.getAttribute('src'),
      );

      let coordinates;

      await axios
        .get(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            fullAddress,
          )}&format=json&countrycodes=AU`,
        )
        .then((res) => {
          const latitude = res.data[0]?.lat;
          const longitude = res.data[0]?.lon;

          coordinates = latitude && longitude ? { latitude, longitude } : {};
        })
        .catch((e) => console.error('e', e));

      return {
        stationName,
        address: {
          streetAddress,
          suburb,
          postcode,
          fullAddress,
        },
        coordinates,
        price,
        logo: imageSrc,
      };
    }
  }

  async function saveDataToFirebase(ref, data, successMsg) {
    try {
      await ref.update(data);
      console.log(successMsg);
    } catch (error) {
      console.error('Error: ' + error);
    }
  }
};
