const { BaseParser } = require('../../BaseParser');
const { saveData } = require('../../../utils/saveData');
const { DubicarsListingParser } = require('./entities/listing');
const { DubicarsDetailParser } = require('./entities/detail');

/**
 * Парсер для сайта Dubicars.com
 * Использует отдельные модули для парсинга списка и деталей
 */
class DubicarsParser extends BaseParser {
    constructor(config) {
        super('Dubicars', {
            baseUrl: 'https://www.dubicars.com',
            listingsUrl: 'https://www.dubicars.com/dubai/used?page={page}',
            ...config
        });
        
        // Инициализируем парсеры
        this.listingParser = new DubicarsListingParser(this.config);
        this.detailParser = new DubicarsDetailParser(this.config);
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
     * ВНИМАНИЕ: Этот метод вызывается модулем-обёрткой (index.js),
     * который управляет жизненным циклом браузера и контекста.
     */
    async run() {
        const results = [];
        
        try {
            console.log(`🚀 Запуск парсера ${this.name}...`);
            
            for await (const listingUrl of this.getListings()) {
                console.log(`🚗 Обрабатываем ${listingUrl}`);
                
                const data = await this.parseListing(listingUrl);
                if (data && this.validateData(data)) {
                    const normalizedData = this.normalizeData(data);
                    results.push(normalizedData);
                    
                    // Сохраняем данные в базу
                    await this.saveData(normalizedData);
                    
                    console.log(`✅ Обработано объявление: ${data.title}`);
                } else {
                    console.log(`⚠️ Пропущено объявление (невалидные данные): ${listingUrl}`);
                }
                
                // Пауза между запросами (оптимизировано)
                const delay = Math.max(100, this.config.delayBetweenRequests || 100); // Минимум 100ms
                await this.sleep(delay);
            }
            
            console.log(`✅ Парсер ${this.name} завершен. Обработано: ${results.length} объявлений`);
            return results;
            
        } catch (error) {
            console.error(`❌ Ошибка в парсере ${this.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Сохранение данных в базу
     */
    async saveData(carDetails) {
        try {
            await saveData(carDetails);
        } catch (error) {
            console.error(`❌ Ошибка сохранения данных:`, error.message);
        }
    }

    /**
     * Утилита для паузы
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Валидация данных для Dubicars
     */
    validateData(data) {
        return super.validateData(data) && 
               data.title && 
               data.title !== "Неизвестно" &&
               data.price && 
               data.price.raw > 0;
    }
}

module.exports = { DubicarsParser };