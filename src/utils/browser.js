const { chromium } = require('playwright');
const { getStealthArgs, getRealisticUserAgent, getRealisticHeaders } = require('./stealth');

function buildProxyConfig(rawProxy) {
    if (!rawProxy) {
        return null;
    }

    // Определяем протокол прокси: http / socks5 и т.п.
    const proxyType = (process.env.PROXY_TYPE || 'http').toLowerCase();
    const protocol = proxyType.includes('socks') ? 'socks5' : 'http';

    // Формат 1: ip:port:login:password
    const parts = rawProxy.split(':');
    if (parts.length === 4 && !rawProxy.includes('@')) {
        const [host, port, username, password] = parts;
        return {
            server: `${protocol}://${host}:${port}`,
            username,
            password
        };
    }

    // Формат 2: host:port@login:password (как в .env проекта)
    if (rawProxy.includes('@')) {
        const [left, right] = rawProxy.split('@');
        const leftParts = left.split(':');
        const rightParts = right.split(':');

        // host:port@user:pass
        if (leftParts.length === 2 && rightParts.length === 2) {
            const [host, port] = leftParts;
            const [username, password] = rightParts;
            return {
                server: `${protocol}://${host}:${port}`,
                username,
                password
            };
        }

        // Любой вариант вида user:pass@host:port или полный URL
        const hasScheme = rawProxy.startsWith('http://') ||
            rawProxy.startsWith('https://') ||
            rawProxy.startsWith('socks5://');

        const withScheme = hasScheme ? rawProxy : `${protocol}://${rawProxy}`;

        try {
            const url = new URL(withScheme);
            const server = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
            const config = { server };

            if (url.username || url.password) {
                config.username = url.username;
                config.password = url.password;
            }

            return config;
        } catch {
            // Если не смогли распарсить URL — пробрасываем как есть
            return { server: rawProxy };
        }
    }

    // Если это просто host:port без схемы
    if (!rawProxy.startsWith('http://') &&
        !rawProxy.startsWith('https://') &&
        !rawProxy.startsWith('socks5://')) {
        return { server: `${protocol}://${rawProxy}` };
    }

    // По умолчанию — как есть
    return { server: rawProxy };
}

async function startBrowser(options = {}) {
    // Позволяем отключить прокси из переменных окружения через useEnvProxy = false
    const { useEnvProxy = true, ...launchOverrides } = options;

    // Определяем режим: headless в Docker, обычный режим локально
    const isHeadless = process.env.NODE_ENV === 'production' || process.env.DOCKER === 'true';
    
    // Используем улучшенные stealth аргументы
    const stealthArgs = getStealthArgs();
    
    // Базовые опции запуска
    const launchOptions = {
        headless: isHeadless,
        args: stealthArgs,
        ...launchOverrides
    };

    // Поддержка прокси:
    // 1) если прокси передан явно в launchOptions.proxy — используем его
    // 2) иначе (и только если useEnvProxy = true) берем из переменных окружения (PROXY_SERVER / HTTP_PROXY / HTTPS_PROXY)
    if (useEnvProxy && !launchOptions.proxy) {
        const envProxy =
            process.env.PROXY_SERVER ||
            process.env.HTTP_PROXY ||
            process.env.HTTPS_PROXY;

        if (envProxy) {
            const proxyConfig = buildProxyConfig(envProxy);
            if (proxyConfig) {
                launchOptions.proxy = proxyConfig;
                const safeProxyLog = {
                    server: proxyConfig.server,
                    hasAuth: !!proxyConfig.username
                };
                console.log('🌐 Запускаем браузер с прокси:', safeProxyLog);
            }
        }
    }

    const browser = await chromium.launch(launchOptions);
    return browser;
}

/**
 * Создание контекста браузера с полной защитой от fingerprinting
 */
async function createStealthContext(browser, options = {}) {
    const userAgent = options.userAgent || getRealisticUserAgent();
    const headers = getRealisticHeaders(userAgent);
    
    const contextOptions = {
        viewport: { width: 1920, height: 1080 },
        userAgent: userAgent,
        locale: options.locale || 'en-US',
        timezoneId: options.timezoneId || 'America/New_York',
        permissions: options.permissions || ['geolocation'],
        geolocation: options.geolocation || { latitude: 25.2048, longitude: 55.2708 },
        extraHTTPHeaders: {
            ...headers,
            ...(options.extraHTTPHeaders || {})
        },
        ignoreHTTPSErrors: true,
        ...options
    };
    
    const context = await browser.newContext(contextOptions);
    
    // Добавляем полный stealth скрипт
    const { getStealthScript } = require('./stealth');
    await context.addInitScript(getStealthScript());
    
    return context;
}

// Функция для мониторинга памяти
function logMemoryUsage() {
    const used = process.memoryUsage();
    console.log(`📊 Использование памяти:
    RSS: ${Math.round(used.rss / 1024 / 1024)} MB
    Heap Used: ${Math.round(used.heapUsed / 1024 / 1024)} MB
    Heap Total: ${Math.round(used.heapTotal / 1024 / 1024)} MB
    External: ${Math.round(used.external / 1024 / 1024)} MB`);
}

// Принудительная очистка памяти
function forceGarbageCollection() {
    if (global.gc) {
        global.gc();
        console.log('🗑️ Принудительная очистка памяти выполнена');
    }
}

module.exports = { 
    startBrowser, 
    createStealthContext,
    logMemoryUsage, 
    forceGarbageCollection,
    buildProxyConfig
};