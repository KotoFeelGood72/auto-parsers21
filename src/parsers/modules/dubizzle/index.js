const { DubizzleParser } = require('./DubizzleParser');
const { startBrowser, createStealthContext, buildProxyConfig } = require('../../../utils/browser');

/**
 * Модуль парсера Dubizzle
 */
class DubizzleModule {
    constructor() {
        this.name = 'Dubizzle';
        this.parser = new DubizzleParser();
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
     * Для Dubizzle ВСЕГДА используем прокси из .env (PROXY_SERVER),
     * причём в формате:
     *   const browser = await chromium.launch();
     *   const context = await browser.newContext({ proxy: { server, ... } });
     */
    async initialize() {
        try {
            console.log(`🚀 Инициализация модуля ${this.name}...`);
            console.log('🌐 Режим Dubizzle: контекст с прокси из PROXY_SERVER');

            // 1. Стартуем браузер БЕЗ прокси
            this.browser = await startBrowser({
                headless: false,
                useEnvProxy: false
            });

            // 2. Собираем proxy-конфиг для контекста
            const rawProxy = process.env.PROXY_SERVER;
            const proxyConfig = buildProxyConfig(rawProxy);

            if (!proxyConfig) {
                throw new Error('Не удалось построить конфигурацию прокси для Dubizzle');
            }

            console.log('🌐 Dubizzle proxy (context-level):', {
                server: proxyConfig.server,
                hasAuth: !!proxyConfig.username
            });

            // 3. Создаём контекст с прокси и "человеческими" настройками
            this.context = await createStealthContext(this.browser, {
                locale: 'en-US',
                timezoneId: 'Asia/Dubai',
                geolocation: { latitude: 25.2048, longitude: 55.2708 },
                proxy: proxyConfig
            });

            // 4. Инициализируем парсер с контекстом
            await this.parser.initialize(this.context);

            console.log(`✅ Модуль ${this.name} инициализирован (контекст через прокси)`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка инициализации модуля ${this.name}:`, error.message);

            // На всякий случай чистим ресурсы при провале инициализации
            try {
                if (this.context) {
                    await this.context.close();
                }
            } catch {}

            try {
                if (this.browser) {
                    await this.browser.close();
                }
            } catch {}

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

module.exports = { DubizzleModule };
