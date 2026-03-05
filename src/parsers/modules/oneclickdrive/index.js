const { OneclickdriveParser } = require('./OneclickdriveParser');

/**
 * Модуль парсера OneClickDrive
 */
class OneclickdriveModule {
    constructor() {
        this.name = 'OneClickDrive';
        this.parser = new OneclickdriveParser();
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
     * Очистка ресурсов модуля
     */
    async cleanup() {
        try {
            if (this.parser && this.parser.cleanup) {
                await this.parser.cleanup();
            }
            
            // Закрываем браузер
            if (this.context) {
                await this.context.close();
            }
            if (this.browser) {
                await this.browser.close();
            }
        } catch (error) {
            console.error(`❌ Ошибка очистки модуля ${this.name}:`, error.message);
        }
    }

    /**
     * Инициализация модуля
     */
    async initialize() {
        try {
            console.log(`🚀 Инициализация модуля ${this.name}...`);
            
            // Инициализируем браузер (без прокси по умолчанию)
            const { startBrowser } = require('../../../utils/browser');
            this.browser = await startBrowser({ useEnvProxy: false });
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

module.exports = { OneclickdriveModule };
