/**
 * Менеджер прокси для обхода региональных блокировок
 */

const https = require('https');
const http = require('http');

class ProxyManager {
    constructor() {
        this.proxies = [];
        this.currentProxyIndex = 0;
        this.failedProxies = new Set();
    }

    /**
     * Получение списка бесплатных прокси
     */
    async fetchFreeProxies() {
        const proxies = [];
        
        try {
            // Пробуем получить прокси из публичных API и GitHub репозиториев
            const proxySources = [
                // API источники
                'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
                'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=5000&country=all',
                
                // GitHub репозитории с прокси
                'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
                'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
                'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
                'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt',
                'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt',
                'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-https.txt',
                'https://raw.githubusercontent.com/fyvri/fresh-proxy-list/main/http.txt',
                'https://raw.githubusercontent.com/fyvri/fresh-proxy-list/main/https.txt',
                'https://raw.githubusercontent.com/UserR3X/proxy-list/main/online/http.txt',
                'https://raw.githubusercontent.com/UserR3X/proxy-list/main/online/https.txt',
                'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
                'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTP_RAW.txt',
                'https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt',
                'https://raw.githubusercontent.com/mmpx12/proxy-list/master/https.txt',
                'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
                'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt',
                'https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/http.txt',
                'https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies_anonymous/http.txt',
                'https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies_geolocation/http.txt',
                'https://raw.githubusercontent.com/zevtyardt/proxy-list/main/http.txt',
                'https://raw.githubusercontent.com/zevtyardt/proxy-list/main/https.txt',
                'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/HTTP.txt',
                'https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/HTTPS.txt',
                'https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/http.txt',
                'https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies_anonymous/http.txt',
                'https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies_geolocation/http.txt'
            ];

            for (const source of proxySources) {
                try {
                    const proxyList = await this.fetchFromUrl(source);
                    if (proxyList && proxyList.length > 0) {
                        proxies.push(...proxyList);
                        console.log(`✅ Получено ${proxyList.length} прокси из источника`);
                        if (proxies.length >= 500) break; // Достаточно прокси
                    }
                } catch (error) {
                    console.warn(`⚠️ Не удалось получить прокси из ${source}: ${error.message}`);
                }
            }

            // Если не получили прокси из API, используем статический список
            if (proxies.length === 0) {
                console.log(`📋 Используем статический список прокси...`);
                proxies.push(...this.getStaticProxies());
            }

            // Фильтруем и валидируем прокси
            this.proxies = this.validateProxies(proxies);
            console.log(`✅ Всего доступно ${this.proxies.length} валидных прокси`);
            
            return this.proxies;
        } catch (error) {
            console.error(`❌ Ошибка получения прокси: ${error.message}`);
            // Используем статический список в случае ошибки
            this.proxies = this.validateProxies(this.getStaticProxies());
            return this.proxies;
        }
    }


    /**
     * Загрузка прокси из URL
     */
    async fetchFromUrl(url) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            
            protocol.get(url, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        // Парсим список прокси (формат: IP:PORT, JSON, CSV и т.д.)
                        const proxies = [];
                        
                        // Пробуем парсить как JSON
                        if (url.includes('proxyscrape') || data.trim().startsWith('[') || data.trim().startsWith('{')) {
                            try {
                                const json = JSON.parse(data);
                                if (Array.isArray(json)) {
                                    json.forEach(item => {
                                        if (typeof item === 'string' && item.includes(':')) {
                                            proxies.push(item.trim());
                                        } else if (typeof item === 'object' && item.ip && item.port) {
                                            proxies.push(`${item.ip}:${item.port}`);
                                        } else if (typeof item === 'object' && item.host && item.port) {
                                            proxies.push(`${item.host}:${item.port}`);
                                        }
                                    });
                                } else if (typeof json === 'object' && json.proxies) {
                                    // Формат {proxies: [...]}
                                    if (Array.isArray(json.proxies)) {
                                        json.proxies.forEach(item => {
                                            if (typeof item === 'string' && item.includes(':')) {
                                                proxies.push(item.trim());
                                            } else if (typeof item === 'object' && item.ip && item.port) {
                                                proxies.push(`${item.ip}:${item.port}`);
                                            }
                                        });
                                    }
                                }
                            } catch (e) {
                                // Если не JSON, парсим как текст
                            }
                        }
                        
                        // Если не получили прокси из JSON, парсим как текст
                        if (proxies.length === 0) {
                            data.split('\n').forEach(line => {
                                const trimmed = line.trim();
                                // Пропускаем комментарии и пустые строки
                                if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
                                    // Формат IP:PORT
                                    if (trimmed.includes(':')) {
                                        const parts = trimmed.split(':');
                                        if (parts.length >= 2) {
                                            // Берем только IP и PORT (игнорируем дополнительные поля в CSV)
                                            const ip = parts[0].trim();
                                            const port = parts[1].trim().split(/[\s,\t]/)[0]; // Берем только порт, игнорируя остальное
                                            if (ip && port && /^\d+$/.test(port)) {
                                                proxies.push(`${ip}:${port}`);
                                            }
                                        }
                                    }
                                }
                            });
                        }
                        
                        resolve(proxies.filter(p => p && p.includes(':')).slice(0, 1000)); // Ограничиваем до 1000 с каждого источника
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
            }).on('error', reject).setTimeout(10000, () => {
                reject(new Error('Timeout'));
            });
        });
    }

    /**
     * Статический список прокси (резервный)
     */
    getStaticProxies() {
        return [
            // Публичные прокси (могут быть нестабильны)
            // Формат: host:port
        ];
    }

    /**
     * Валидация прокси
     */
    validateProxies(proxies) {
        // IP-адреса CDN и известных сервисов, которые не являются прокси
        const cdnRanges = [
            /^104\./,
            /^172\.67\./,
            /^141\.101\./,
            /^188\.114\./,
            /^162\.158\./,
            /^108\.162\./,
            /^198\.41\./,
            /^190\.93\./,
            /^173\.245\./,
            /^131\.0\./,
            /^2400:cb00::/,
            /^2606:4700::/,
            /^2803:f800::/,
            /^2405:b500::/,
            /^2405:8100::/,
            /^2a06:98c0::/,
            /^2c0f:f248::/
        ];
        
        return proxies
            .filter(proxy => {
                // Проверяем формат IP:PORT
                const parts = proxy.split(':');
                if (parts.length !== 2) return false;
                
                const port = parseInt(parts[1]);
                if (isNaN(port) || port < 1 || port > 65535) return false;
                
                const host = parts[0].trim();
                
                // Исключаем CDN IP
                const isCDN = cdnRanges.some(range => range.test(host));
                if (isCDN) return false;
                
                // Исключаем localhost и приватные IP
                if (host === 'localhost' || 
                    host === '127.0.0.1' || 
                    host.startsWith('192.168.') ||
                    host.startsWith('10.') ||
                    host.startsWith('172.16.') ||
                    host.startsWith('172.17.') ||
                    host.startsWith('172.18.') ||
                    host.startsWith('172.19.') ||
                    host.startsWith('172.20.') ||
                    host.startsWith('172.21.') ||
                    host.startsWith('172.22.') ||
                    host.startsWith('172.23.') ||
                    host.startsWith('172.24.') ||
                    host.startsWith('172.25.') ||
                    host.startsWith('172.26.') ||
                    host.startsWith('172.27.') ||
                    host.startsWith('172.28.') ||
                    host.startsWith('172.29.') ||
                    host.startsWith('172.30.') ||
                    host.startsWith('172.31.')) {
                    return false;
                }
                
                return true;
            })
            .map(proxy => {
                const [host, port] = proxy.split(':');
                return {
                    server: `http://${host}:${port}`,
                    host: host.trim(),
                    port: parseInt(port)
                };
            });
    }

    /**
     * Получение следующего рабочего прокси
     */
    getNextProxy() {
        if (this.proxies.length === 0) {
            return null;
        }

        // Пробуем найти рабочий прокси
        let attempts = 0;
        while (attempts < this.proxies.length) {
            const proxy = this.proxies[this.currentProxyIndex];
            this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
            
            const proxyKey = `${proxy.host}:${proxy.port}`;
            if (!this.failedProxies.has(proxyKey)) {
                return proxy;
            }
            
            attempts++;
        }

        // Если все прокси не работают, сбрасываем список и пробуем снова
        if (this.failedProxies.size >= this.proxies.length) {
            console.log(`🔄 Все прокси не работают, сбрасываем список...`);
            this.failedProxies.clear();
            this.currentProxyIndex = 0;
            return this.proxies[0];
        }

        return null;
    }

    /**
     * Помечаем прокси как нерабочий
     */
    markProxyAsFailed(proxy) {
        if (proxy) {
            const proxyKey = `${proxy.host}:${proxy.port}`;
            this.failedProxies.add(proxyKey);
            console.log(`⚠️ Прокси ${proxyKey} помечен как нерабочий`);
        }
    }

    /**
     * Получение конфигурации прокси для Playwright
     */
    getProxyConfig(proxy) {
        if (!proxy) return {};
        
        return {
            proxy: {
                server: proxy.server
            }
        };
    }
}

// Создаем singleton
const proxyManager = new ProxyManager();

module.exports = { proxyManager };


