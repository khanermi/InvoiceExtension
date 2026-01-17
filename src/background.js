// Слушаем сообщения от content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "openGenerator") {
        // 1. Сохраняем полученные данные во временное хранилище браузера
        chrome.storage.local.set({ tempInvoiceData: request.data }, () => {
            // 2. Открываем нашу внутреннюю страницу generator.html в новой вкладке
            chrome.tabs.create({ url: 'generator.html' });
        });
    }
});