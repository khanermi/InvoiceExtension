console.log("AliExpress Invoice Extension: Script loaded");

// 1. ПАРСИНГ ТОВАРОВ (Список)
function scrapeLineItems() {
    const items = [];
    const itemContainers = document.querySelectorAll('.order-detail-item-content');

    itemContainers.forEach(container => {
        try {
            // Название и ссылка
            const titleLink = container.querySelector('.item-title a');
            const titleEl = titleLink || container.querySelector('.item-title');

            const description = titleEl ? titleEl.innerText.trim() : "Towar AliExpress";
            const productUrl = titleLink ? titleLink.href : null;

            // Цена
            const priceEl = container.querySelector('.es--wrap--1Hlfkoj') || container.querySelector('.item-price');
            let rawPrice = "0";
            if (priceEl) {
                rawPrice = priceEl.innerText.replace(/[^\d.,]/g, '').replace(',', '.');
            }
            const grossUnitPrice = parseFloat(rawPrice) || 0;

            // Количество
            const qtyEl = container.querySelector('.item-price-quantity');
            let quantity = 1;
            if (qtyEl) {
                const qtyText = qtyEl.innerText.toLowerCase().replace('x', '').trim();
                quantity = parseInt(qtyText) || 1;
            }

            items.push({
                description: description,
                productUrl: productUrl,
                quantity: quantity,
                grossUnitPrice: grossUnitPrice,
                vatRate: 0,
                totalGrossPrice: grossUnitPrice * quantity
            });

        } catch (e) {
            console.error("Ошибка парсинга товара:", e);
        }
    });

    return items;
}

// 2. ПАРСИНГ ДАТЫ (Польской)
function getSalesDateFromHTML() {
    try {
        const dateLabel = document.querySelector('[data-pl="order_detail_gray_date"]');
        if (!dateLabel) return null;

        const fullText = dateLabel.parentElement.textContent.trim();
        const monthsPL = {
            'sty': '01', 'lut': '02', 'mar': '03', 'kwi': '04', 'maj': '05', 'cze': '06',
            'lip': '07', 'sie': '08', 'wrz': '09', 'paź': '10', 'lis': '11', 'gru': '12'
        };

        const match = fullText.match(/(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})/i);
        if (match) {
            const day = match[1].padStart(2, '0');
            const monthStr = match[2].toLowerCase();
            const year = match[3];
            const month = monthsPL[monthStr];
            if (day && month && year) return `${year}-${month}-${day}`;
        }
    } catch (e) { console.error("Ошибка даты:", e); }
    return null;
}

// 3. ПАРСИНГ ПРОДАВЦА (Имя убрано, только ссылка)
function getSellerInfo() {
    const storeEl = document.querySelector('.order-detail-item-store');

    // Имя оставляем дефолтным (парсинг удален по запросу)
    let name = "AliExpress Seller";
    let url = "";

    if (storeEl) {
        // Мы НЕ парсим имя (.store-name), как вы и просили.

        // Ссылка на магазин
        const linkEl = storeEl.querySelector('a');
        if (linkEl) {
            url = linkEl.getAttribute('href');
            if (url && url.startsWith('//')) {
                url = 'https:' + url;
            }
        }
    }
    return { name, url };
}

// 4. ПАРСИНГ НДС (Асинхронный с наведением мыши)
function parseVatFromDom() {
    try {
        const hintContents = document.querySelectorAll('.popover-hint-content, .comet-popover-content');
        for (let container of hintContents) {
            const text = container.textContent || "";
            if (text.includes("Podatek VAT")) {
                const match = text.match(/Podatek VAT:\s*([\d,.\s]+)/);
                if (match) {
                    const cleanPrice = match[1].replace(/[^\d.,]/g, '').replace(',', '.');
                    return parseFloat(cleanPrice) || 0;
                }
            }
        }
    } catch (e) { console.error(e); }
    return 0;
}

async function getVatAmountAsync() {
    // 1. Проверяем, может уже открыто
    let vatVal = parseVatFromDom();
    if (vatVal > 0) return vatVal;

    // 2. Ищем иконку вопроса
    const allSpans = Array.from(document.querySelectorAll('span'));
    const vatLabel = allSpans.find(s => s.textContent && s.textContent.includes('Wliczono podatek VAT'));

    if (vatLabel) {
        let icon = vatLabel.querySelector('.comet-icon-help');
        if (!icon) icon = vatLabel.nextElementSibling?.querySelector('.comet-icon-help') || vatLabel.nextElementSibling;

        if (icon) {
            // Эмулируем наведение
            const mouseOverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window });
            const mouseEnterEvent = new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window });

            icon.dispatchEvent(mouseOverEvent);
            icon.dispatchEvent(mouseEnterEvent);

            // Ждем 500 мс появления попапа
            await new Promise(resolve => setTimeout(resolve, 500));

            // Парсим снова
            vatVal = parseVatFromDom();

            // Убираем мышь (опционально)
            const mouseOut = new MouseEvent('mouseout', { bubbles: true });
            icon.dispatchEvent(mouseOut);
        }
    }
    return vatVal || 0;
}

// 5. ГЛАВНАЯ ФУНКЦИЯ СБОРА (ASYNC)
async function scrapeData() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('orderId') || "---";

    let totalOrderPrice = "0";
    try {
        const targetPriceEls = document.querySelectorAll('.rightPriceClass');
        if (targetPriceEls.length > 0) {
            totalOrderPrice = targetPriceEls[targetPriceEls.length - 1].innerText;
        } else {
            const fallbackEls = document.querySelectorAll('.order-price-bold');
            if (fallbackEls.length > 0) {
                totalOrderPrice = fallbackEls[fallbackEls.length - 1].innerText;
            }
        }
    } catch (e) { console.error(e); }

    const parsedDate = getSalesDateFromHTML();
    const sellerInfo = getSellerInfo();
    const parsedVat = await getVatAmountAsync(); // Ждем НДС

    return {
        orderId: orderId,
        saleDate: parsedDate || new Date().toISOString().slice(0, 10),
        seller: {
            name: sellerInfo.name, // Будет "AliExpress Seller"
            storeUrl: sellerInfo.url
        },
        lineItems: scrapeLineItems(),
        parsedTotalStr: totalOrderPrice,
        totalVat: parsedVat,
        url: window.location.href
    };
}

// 6. ВНЕДРЕНИЕ КНОПКИ
function injectButton() {
    const targetContainer = document.querySelector('.order-status.order-block');

    if (!targetContainer || document.getElementById('my-faktura-btn')) return;

    const btn = document.createElement("button");
    btn.id = "my-faktura-btn";
    btn.type = "button";
    btn.className = "comet-btn";
    btn.style.cssText = "margin-left: 10px; background-color: #2e7d32; color: white; border-color: #2e7d32;";

    const span = document.createElement("span");
    span.innerText = "Faktura (PDF)";
    btn.appendChild(span);

    btn.onclick = async () => {
        const originalText = span.innerText;
        span.innerText = "Pobieranie...";
        btn.disabled = true;

        try {
            const data = await scrapeData();

            chrome.runtime.sendMessage({ action: "openGenerator", data: data }, () => {
                span.innerText = originalText;
                btn.disabled = false;
            });
        } catch (e) {
            console.error("Ошибка при сборе данных:", e);
            span.innerText = "Błąd!";
            setTimeout(() => {
                span.innerText = originalText;
                btn.disabled = false;
            }, 2000);
        }
    };

    targetContainer.appendChild(btn);
}

// 7. НАБЛЮДАТЕЛЬ (Observer)
const observer = new MutationObserver((mutations) => {
    injectButton();
});

observer.observe(document.body, { childList: true, subtree: true });

injectButton();