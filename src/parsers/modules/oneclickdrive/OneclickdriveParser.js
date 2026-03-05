const { BaseParser } = require('../../BaseParser');
const { OneclickdriveListingParser } = require('./entities/listing');
const { OneclickdriveDetailParser } = require('./entities/detail');
const { saveData } = require('../../../utils/saveData');

/**
 * Парсер для сайта OneClickDrive.com
 * Использует модульную структуру с отдельными парсерами для списков и деталей
 */
class OneclickdriveParser extends BaseParser {
    constructor(config = {}) {
        super('OneClickDrive', {
            baseUrl: 'https://www.oneclickdrive.com',
            listingsUrl: 'https://www.oneclickdrive.com/buy-used-cars-dubai?page={page}',
            timeout: 60000,
            delayBetweenRequests: 1000,
            maxRetries: 3,
            enableImageLoading: false,
            ...config
        });
        
        // Инициализируем парсеры
        this.listingParser = new OneclickdriveListingParser(this.config);
        this.detailParser = new OneclickdriveDetailParser(this.config);
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
     * Переопределяем метод BaseParser для правильного маппинга полей OneClickDrive
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
            kilometers: rawData.kilometers || 0,
            // Правильный маппинг для цен - сначала проверяем прямые поля, затем вложенные
            price_formatted: rawData.price_formatted || rawData.price?.formatted || "0",
            price_raw: rawData.price_raw || rawData.price?.raw || 0,
            currency: rawData.currency || rawData.price?.currency || "Неизвестно",
            exterior_color: rawData.exterior_color || "Неизвестно",
            location: rawData.location || "Неизвестно",
            // Правильный маппинг для контактов - сначала проверяем прямые поля, затем вложенные
            phone: rawData.phone || rawData.contact?.phone || "Не указан",
            // Правильный маппинг для продавца - сначала проверяем прямые поля, затем вложенные
            seller_name: rawData.seller_name || rawData.sellers?.sellerName || "Неизвестен",
            seller_type: rawData.seller_type || rawData.sellers?.sellerType || "Неизвестен",
            seller_logo: rawData.seller_logo || rawData.sellers?.sellerLogo || null,
            seller_profile_link: rawData.seller_profile_link || rawData.sellers?.sellerProfileLink || null,
            main_image: rawData.main_image || null,
            photos: rawData.photos || []
        };
    }

    /**
     * Сохранение данных в базу
     */
    async saveData(carDetails) {
        try {
            // Данные уже нормализованы в парсере, передаем их напрямую
            await saveData(carDetails);
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

module.exports = { OneclickdriveParser };
