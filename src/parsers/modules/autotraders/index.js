const { AutotradersParser } = require('./AutotradersParser');

/**
 * Модуль парсера AutoTraders
 */
class AutotradersModule {
    constructor() {
        this.name = 'AutoTraders';
        this.parser = new AutotradersParser();
    }

    /**
     * Получение списка объявлений
     */
    async* getListings() {
        console.log(`🚀 Запускаем парсер ${this.name}...`);
        yield* this.parser.getListings();
    }

    /**
     * Парсинг детальной информации об объявлении
     */
    async parseListing(url) {
        return await this.parser.parseListing(url);
    }

    /**
     * Нормализация данных
     */
    normalizeData(rawData) {
        return this.parser.normalizeData(rawData);
    }

    /**
     * Запуск парсера
     */
    async run() {
        try {
            console.log(`🚀 Запускаем парсер ${this.name}...`);
            
            // Запускаем парсинг
            const results = await this.parser.run();
            
            console.log(`✅ Парсер ${this.name} завершен. Обработано: ${results.length} объявлений`);
            
            // Закрываем браузер
            if (this.browser) {
                await this.browser.close();
            }
            
            return {
                success: true,
                processed: results.length,
                results: results
            };
            
        } catch (error) {
            console.error(`❌ Ошибка в модуле ${this.name}:`, error.message);
            
            // Закрываем браузер в случае ошибки
            if (this.browser) {
                await this.browser.close();
            }
            
            return {
                success: false,
                error: error.message,
                processed: 0
            };
        }
    }

    /**
     * Инициализация модуля
     */
    async initialize() {
        try {
            console.log(`🚀 Инициализация модуля ${this.name}...`);
            
            // Инициализируем браузер
            const { startBrowser } = require('../../../utils/browser');
            this.browser = await startBrowser();
            this.context = await this.browser.newContext();
            
            // Инициализируем парсер с контекстом
            await this.parser.initialize(this.context);
            
            console.log(`✅ Модуль ${this.name} инициализирован`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка инициализации модуля ${this.name}:`, error.message);
            return false;
        }
    }

    /**
     * Очистка ресурсов модуля
     */
    async cleanup() {
        try {
            if (this.parser && typeof this.parser.cleanup === 'function') {
                await this.parser.cleanup();
            }
        } catch (err) {
            console.error(`❌ Ошибка очистки парсера в модуле ${this.name}:`, err.message);
        }

        try {
            if (this.context) {
                await this.context.close();
            }
        } catch (err) {
            console.error(`❌ Ошибка закрытия контекста в модуле ${this.name}:`, err.message);
        }

        try {
            if (this.browser) {
                await this.browser.close();
            }
        } catch (err) {
            console.error(`❌ Ошибка закрытия браузера в модуле ${this.name}:`, err.message);
        }
    }

    /**
     * Получение информации о модуле
     */
    getInfo() {
        return {
            name: this.name,
            baseUrl: this.parser.config.baseUrl,
            timeout: this.parser.config.timeout
        };
    }

    /**
     * Проверка доступности модуля
     */
    async isAvailable() {
        // Пока что всегда возвращаем true
        // В будущем можно добавить реальную проверку доступности сайта
        return true;
    }
}

module.exports = { AutotradersModule };
