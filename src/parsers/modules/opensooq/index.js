const { OpenSooqParser } = require('./OpenSooqParser');
const { configLoader } = require('../../ConfigLoader');

/**
 * Модуль парсера OpenSooq
 */
class OpenSooqModule {
    constructor() {
        this.name = 'OpenSooq';
        this.config = this.loadConfig();
        this.parser = new OpenSooqParser(this.config);
    }

    /**
     * Загрузка конфигурации модуля из централизованного хранилища
     */
    loadConfig() {
        try {
            const config = configLoader.getConfig('opensooq');
            if (!config) {
                throw new Error(`Конфигурация ${this.name} не найдена в централизованном хранилище`);
            }
            return config;
        } catch (error) {
            console.error(`❌ Ошибка загрузки конфигурации ${this.name}:`, error.message);
            throw error;
        }
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
            
            // Инициализируем браузер (без прокси по умолчанию)
            const { startBrowser } = require('../../../utils/browser');
            this.browser = await startBrowser({ useEnvProxy: false });
            
            // Создаем контекст с настройками для обхода региональной блокировки
            const contextOptions = {
                locale: 'en-AE', // Локаль для ОАЭ
                geolocation: { latitude: 25.2048, longitude: 55.2708 }, // Координаты Дубая
                permissions: ['geolocation'],
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                extraHTTPHeaders: {
                    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Referer': 'https://ae.opensooq.com/en',
                    'Origin': 'https://ae.opensooq.com'
                }
            };
            
            this.context = await this.browser.newContext(contextOptions);
            
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
            baseUrl: this.config.baseUrl,
            timeout: this.config.timeout
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

module.exports = { OpenSooqModule };
