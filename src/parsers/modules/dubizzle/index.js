const { DubizzleParser } = require('./DubizzleParser');
const { startBrowser, createStealthContext, buildProxyConfig } = require('../../../utils/browser');
const axios = require('axios');

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
     * Для Dubizzle ВСЕГДА используем HTTP-прокси из .env (PROXY_SERVER).
     * Если Dubizzle возвращает страницу блокировки (Error 15 / Imperva),
     * автоматически перебираем соседние порты (например, 10005..10014),
     * пока не найдём порт без блокировки или не исчерпаем попытки.
     */
    async initialize() {
        try {
            console.log(`🚀 Инициализация модуля ${this.name}...`);
            console.log('🌐 Режим Dubizzle: браузер с прокси из PROXY_SERVER (с авто-подбором порта)');

            const envProxy = process.env.PROXY_SERVER;
            if (!envProxy) {
                throw new Error('Переменная PROXY_SERVER не задана');
            }

            // Разбираем строку вида host:port@login:password
            const [hostPortPart, authPart] = envProxy.split('@');
            if (!hostPortPart || !authPart) {
                throw new Error('PROXY_SERVER должен быть в формате host:port@login:password');
            }

            const [host, basePortStr] = hostPortPart.split(':');
            const [username, password] = authPart.split(':');

            const basePort = parseInt(basePortStr, 10) || 10000;
            const maxPortsToTry = 10; // попробуем basePort..basePort+9
            const listingsUrl = this.parser.config.listingsUrl || this.parser.config.baseUrl;

            let selectedPort = null;

            for (let offset = 0; offset < maxPortsToTry; offset++) {
                const port = basePort + offset;
                console.log(`🔍 Проверяем прокси ${host}:${port} для Dubizzle...`);

                try {
                    const response = await axios.get(listingsUrl, {
                        timeout: 8000,
                        proxy: {
                            protocol: 'http',
                            host,
                            port,
                            auth: { username, password }
                        },
                        validateStatus: () => true
                    });

                    const status = response.status;
                    const body = typeof response.data === 'string' ? response.data : '';
                    const lower = body.toLowerCase();

                    const wafBlocked =
                        lower.includes('error 15') ||
                        lower.includes('access denied') ||
                        lower.includes('powered by imperva');

                    if (status >= 400 || wafBlocked) {
                        console.log(`⚠️ Порт ${port} заблокирован (status=${status}, wafBlocked=${wafBlocked})`);
                        continue;
                    }

                    selectedPort = port;
                    console.log(`✅ Для Dubizzle выбран прокси-порт ${port} (status=${status})`);
                    break;
                } catch (checkError) {
                    console.log(`⚠️ Ошибка проверки порта ${port}: ${checkError.message}`);
                }
            }

            if (!selectedPort) {
                console.error('❌ Не удалось найти рабочий прокси-порт для Dubizzle без Error 15');
                return false;
            }

            const rawProxy = `${host}:${selectedPort}@${username}:${password}`;
            const proxyConfig = buildProxyConfig(rawProxy);

            if (!proxyConfig) {
                throw new Error('Не удалось построить конфигурацию прокси для Dubizzle после подбора порта');
            }

            console.log('🌐 Dubizzle proxy (browser-level):', {
                server: proxyConfig.server,
                hasAuth: !!proxyConfig.username
            });

            // 2. Стартуем браузер с явным HTTP-прокси
            this.browser = await startBrowser({
                headless: false,
                useEnvProxy: false,
                proxy: proxyConfig
            });

            // 3. Создаём контекст с "человеческими" настройками
            this.context = await createStealthContext(this.browser, {
                locale: 'en-US',
                timezoneId: 'Asia/Dubai',
                geolocation: { latitude: 25.2048, longitude: 55.2708 }
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
