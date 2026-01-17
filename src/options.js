// Сохранение
document.getElementById('saveBtn').addEventListener('click', () => {
    // Собираем объект buyer согласно вашей схеме
    const buyerData = {
        name: document.getElementById('buyerName').value,
        taxId: document.getElementById('buyerTaxId').value,
        addressFull: document.getElementById('buyerAddress').value
    };

    // Сохраняем под ключом 'invoice_buyer_config'
    chrome.storage.local.set({ invoice_buyer_config: buyerData }, () => {
        const status = document.getElementById('status');
        status.innerText = 'Zapisano pomyślnie!';
        setTimeout(() => { status.innerText = ''; }, 2000);
    });
});

// Загрузка
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['invoice_buyer_config'], (result) => {
        if (result.invoice_buyer_config) {
            const data = result.invoice_buyer_config;
            document.getElementById('buyerName').value = data.name || '';
            document.getElementById('buyerTaxId').value = data.taxId || '';
            document.getElementById('buyerAddress').value = data.addressFull || '';
        }
    });
});