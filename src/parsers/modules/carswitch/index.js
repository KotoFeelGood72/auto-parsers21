const { CarswitchParser } = require('./CarswitchParser');
const { configLoader } = require('../../ConfigLoader');
const { telegramService } = require('../../../services/TelegramService');

/**
 * Модуль парсера Carswitch
 */
class CarswitchModule {
    constructor() {
        this.name = 'Carswitch';
        this.config = this.loadConfig();
        this.parser = new CarswitchParser(this.config);
    }

    /**
     * Загрузка конфигурации модуля из централизованного хранилища
     */
    loadConfig() {
        try {
            const config = configLoader.getConfig('carswitch');
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
            const { startBrowser, createStealthContext } = require('../../../utils/browser');
            this.browser = await startBrowser({ useEnvProxy: false });
            
            // Создаем контекст с полной защитой от fingerprinting
            this.context = await createStealthContext(this.browser, {
                locale: 'en-US',
                timezoneId: 'America/New_York',
                permissions: ['geolocation'],
                geolocation: { latitude: 25.2048, longitude: 55.2708 }, // Координаты ОАЭ
                extraHTTPHeaders: {
                    'Referer': this.config.baseUrl || 'https://www.carswitch.com',
                    'Origin': this.config.baseUrl || 'https://www.carswitch.com'
                }
            });
            
            // Инициализируем парсер с контекстом
            await this.parser.initialize(this.context);
            
            console.log(`✅ Модуль ${this.name} инициализирован с настройками обхода reCAPTCHA`);
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

module.exports = { CarswitchModule };
