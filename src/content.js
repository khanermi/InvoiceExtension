// 1. ПАРСИНГ ТОВАРОВ (Список)
function scrapeLineItems() {
    const items = [];
    // Ищем контейнеры товаров
    const itemContainers = document.querySelectorAll('.order-detail-item-content');

    itemContainers.forEach(container => {
        try {
            // Название
            const titleEl = container.querySelector('.item-title a') || container.querySelector('.item-title');
            const description = titleEl ? titleEl.innerText.trim() : "Towar AliExpress";

            // Цена за штуку
            const priceEl = container.querySelector('.es--wrap--1Hlfkoj') || container.querySelector('.item-price');
            let rawPrice = "0";
            if (priceEl) {
                // Чистим цену: оставляем только цифры, точки и запятые
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

// 2. ГЛАВНАЯ ФУНКЦИЯ СБОРА ДАННЫХ
function scrapeData() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('orderId') || "---";

    // --- ПАРСИНГ ИТОГОВОЙ СУММЫ (SUMA) ---
    let totalOrderPrice = "0";
    try {
        // Приоритет 1: Ищем по вашему классу 'rightPriceClass'
        // Обычно финальная цена идет последней в списке (после Subtotal и Shipping)
        const targetPriceEls = document.querySelectorAll('.rightPriceClass');

        if (targetPriceEls.length > 0) {
            // Берем последний элемент, так как это обычно "Total"
            totalOrderPrice = targetPriceEls[targetPriceEls.length - 1].innerText;
        } else {
            // Запасной вариант (старые классы)
            const fallbackEls = document.querySelectorAll('.order-price-bold');
            if (fallbackEls.length > 0) {
                totalOrderPrice = fallbackEls[fallbackEls.length - 1].innerText;
            }
        }
    } catch (e) {
        console.error("Не удалось найти общую цену", e);
    }

    return {
        orderId: orderId,
        saleDate: new Date().toISOString().slice(0, 10),
        sellerName: "AliExpress Seller",

        // Список товаров
        lineItems: scrapeLineItems(),
        // Итоговая строка (например "30,15 zł") для расчетов в генераторе
        parsedTotalStr: totalOrderPrice,

        url: window.location.href
    };
}

// 3. ВНЕДРЕНИЕ КНОПКИ
function injectButton() {
    // Ищем блок статуса заказа
    const targetContainer = document.querySelector('.order-status.order-block');
    // Проверка, чтобы не дублировать кнопку
    if (!targetContainer || document.getElementById('my-faktura-btn')) return;

    const btn = document.createElement("button");
    btn.id = "my-faktura-btn";
    btn.type = "button";
    btn.className = "comet-btn";
    btn.style.cssText = "margin-left: 10px; background-color: #2e7d32; color: white; border-color: #2e7d32;";

    const span = document.createElement("span");
    span.innerText = "Faktura (PDF)";
    btn.appendChild(span);

    btn.onclick = () => {
        const originalText = span.innerText;
        span.innerText = "Pobieranie...";
        btn.disabled = true;

        const data = scrapeData();

        chrome.runtime.sendMessage({ action: "openGenerator", data: data }, () => {
            span.innerText = originalText;
            btn.disabled = false;
        });
    };

    targetContainer.appendChild(btn);
}

// Наблюдатель за изменениями DOM (так как React отрисовывает страницу динамически)
const observer = new MutationObserver((mutations) => {
    injectButton();
});

observer.observe(document.body, { childList: true, subtree: true });
injectButton();