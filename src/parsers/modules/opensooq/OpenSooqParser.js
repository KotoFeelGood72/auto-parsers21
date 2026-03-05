const { BaseParser } = require('../../BaseParser');
const { OpenSooqListingParser } = require('./entities/listing');
const { OpenSooqDetailParser } = require('./entities/detail');
const { saveData } = require('../../../utils/saveData');

/**
 * Парсер для сайта OpenSooq.com
 * Использует модульную структуру с отдельными парсерами для списков и деталей
 */
class OpenSooqParser extends BaseParser {
    constructor(config) {
        super('OpenSooq', {
            baseUrl: 'https://ae.opensooq.com',
            listingsUrl: 'https://ae.opensooq.com/en/cars/cars-for-sale',
            timeout: 90000,
            delayBetweenRequests: 2000,
            maxRetries: 3,
            retryDelay: 5000,
            enableImageLoading: false,
            ...config
        });
        
        // Инициализируем парсеры
        this.listingParser = new OpenSooqListingParser(this.config);
        this.detailParser = new OpenSooqDetailParser(this.config);
    }

    /**
     * Получение списка объявлений
     */
    async* getListings() {
        yield* this.listingParser.getListings(this.context);
    }

    /**
     * Парсинг детальной информации об объявлении
     */
    async parseListing(url) {
        return await this.detailParser.parseCarDetails(url, this.context);
    }

    /**
     * Запуск полного цикла парсинга
     */
    async run() {
        const results = [];
        
        try {
            console.log(`🚀 Запускаем парсер ${this.name}...`);
            
            // Получаем список объявлений и парсим каждое
            for await (const listingUrl of this.getListings()) {
                console.log(`🚗 Обрабатываем ${listingUrl}`);
                
                try {
                    const carDetails = await this.parseListing(listingUrl);
                    if (carDetails) {
                        results.push(carDetails);
                        
                        // Сохраняем данные в базу
                        await this.saveData(carDetails);
                    }
                } catch (error) {
                    console.error(`❌ Ошибка при обработке ${listingUrl}:`, error);
                }
            }
            
            console.log(`✅ Парсер ${this.name} завершен. Обработано: ${results.length} объявлений`);
            return results;
            
        } catch (error) {
            console.error(`❌ Ошибка в парсере ${this.name}:`, error.message);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Нормализация данных для сохранения в БД
     */
    normalizeData(rawData) {
        return {
            short_url: rawData.short_url || null,
            title: rawData.title || "Неизвестно",
            make: rawData.make || "Неизвестно",
            model: rawData.model || "Неизвестно",
            year: rawData.year || "Неизвестно",
            body_type: rawData.body_type || "Неизвестно",
            horsepower: rawData.horsepower || "Неизвестно",
            fuel_type: rawData.fuel_type || "Неизвестно",
            motors_trim: rawData.motors_trim || "Неизвестно",
            kilometers: parseInt(rawData.kilometers, 10) || 0,
            price_formatted: rawData.price?.formatted || "0",
            price_raw: rawData.price?.raw || 0,
            currency: rawData.price?.currency || "Неизвестно",
            exterior_color: rawData.exterior_color || "Неизвестно",
            location: rawData.location || "Неизвестно",
            phone: rawData.contact?.phone || "Не указан",
            seller_name: rawData.sellers?.sellerName || "Неизвестен",
            seller_type: rawData.sellers?.sellerType || "Неизвестен",
            seller_logo: rawData.sellers?.sellerLogo || null,
            seller_profile_link: rawData.sellers?.sellerProfileLink || null,
            main_image: rawData.main_image || null,
            photos: rawData.photos || []
        };
    }

    /**
     * Сохранение данных в базу
     */
    async saveData(carDetails) {
        try {
            const normalizedData = this.normalizeData(carDetails);
            await saveData(normalizedData);
        } catch (error) {
            console.error(`❌ Ошибка сохранения данных:`, error.message);
        }
    }

    /**
     * Получение информации о парсере
     */
    getInfo() {
        return {
            name: this.name,
            baseUrl: this.config.baseUrl,
            listingsUrl: this.config.listingsUrl,
            timeout: this.config.timeout
        };
    }
}

module.exports = { OpenSooqParser };