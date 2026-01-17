document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['invoice_buyer_config', 'tempInvoiceData'], (result) => {

        const buyerConfig = result.invoice_buyer_config || { name: "", taxId: "", addressFull: "" };
        const parsedData = result.tempInvoiceData || { lineItems: [], parsedTotalStr: "0" };

        let calculatedItems = (parsedData.lineItems || []).map(item => ({
            ...item,
            productUrl: item.productUrl || null,
            totalGross: item.grossUnitPrice * item.quantity
        }));

        const itemsSum = calculatedItems.reduce((acc, item) => acc + item.totalGross, 0);
        const totalOrderPrice = parseFloat((parsedData.parsedTotalStr || "0").replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

        const difference = totalOrderPrice - itemsSum;
        if (Math.abs(difference) > 0.01) {
            const desc = difference > 0 ? "Koszt dostawy (Shipping)" : "Rabat / Kupon (Discount)";
            calculatedItems.push({
                description: desc,
                productUrl: null,
                quantity: 1,
                grossUnitPrice: difference,
                totalGross: difference
            });
        }

        const initialDate = parsedData.saleDate || new Date().toISOString().slice(0, 10);

        const sellerName = parsedData.seller?.name || "AliExpress Seller";
        const sellerUrl = parsedData.seller?.storeUrl || "";
        const sellerAddress = "";
        const sellerTaxId = "";

        const initialSellerRaw = `${sellerName}\nVAT ID: ${sellerTaxId}\n${sellerAddress}`;

        const invoiceData = {
            invoiceHeader: {
                invoiceNumber: parsedData.orderId ? `FV-${parsedData.orderId}` : `FV-${Date.now()}`,
                orderId: parsedData.orderId || "---",
                issueDate: initialDate,
                saleDate: initialDate
            },
            seller: {
                name: sellerName,
                taxId: sellerTaxId,
                addressFull: sellerAddress,
                storeUrl: sellerUrl,
                rawText: initialSellerRaw
            },
            buyer: {
                ...buyerConfig,
                rawText: `${buyerConfig.name}\nNIP: ${buyerConfig.taxId}\n${buyerConfig.addressFull}`
            },
            lineItems: calculatedItems,
            totalVatAmount: parsedData.totalVat || 0,
            sourceUrl: parsedData.url
        };

        window.currentInvoiceData = invoiceData;

        initUI();
    });

    // --- UI ---
    function initUI() {
        const data = window.currentInvoiceData;

        // --- ИНИЦИАЛИЗАЦИЯ ИНПУТОВ ---
        bindInput('invoiceNumber', data.invoiceHeader.invoiceNumber, (val) => data.invoiceHeader.invoiceNumber = val);
        bindInput('issueDate', data.invoiceHeader.issueDate, (val) => data.invoiceHeader.issueDate = val);
        bindInput('saleDate', data.invoiceHeader.saleDate, (val) => data.invoiceHeader.saleDate = val);
        bindInput('orderId', data.invoiceHeader.orderId, (val) => data.invoiceHeader.orderId = val);

        bindInput('sellerName', data.seller.name, (val) => {
            data.seller.name = val;
            updateSellerRawText();
        });
        bindInput('sellerTaxId', data.seller.taxId, (val) => {
            data.seller.taxId = val;
            updateSellerRawText();
        });
        bindInput('sellerAddress', data.seller.addressFull, (val) => {
            data.seller.addressFull = val;
            updateSellerRawText();
        });

        // Кнопка ссылки
        const storeBtn = document.getElementById('sellerStoreLink');
        if (data.seller.storeUrl) {
            storeBtn.href = data.seller.storeUrl;
            storeBtn.style.display = 'inline-flex';
        } else {
            storeBtn.style.display = 'none';
        }

        bindInput('buyerData', data.buyer.rawText, (val) => data.buyer.rawText = val);

        document.getElementById('sourceUrl').value = data.sourceUrl;
        const linkEl = document.getElementById('sourceLinkVisible');
        linkEl.href = data.sourceUrl;
        linkEl.innerText = `Źródło zamówienia: ${data.sourceUrl.substring(0, 40)}...`;

        const inputVat = document.getElementById('inputVat');
        inputVat.value = data.totalVatAmount.toFixed(2);
        inputVat.addEventListener('input', (e) => {
            data.totalVatAmount = parseFloat(e.target.value) || 0;
            updateTotalDisplay();
        });

        renderItemsTable();
        updateTotalDisplay();

        // --- ИНИЦИАЛИЗАЦИЯ AI MODAL ---
        setupAiModal();
    }

    // --- ЛОГИКА ДЛЯ AI POPUP ---
    function setupAiModal() {
        const modal = document.getElementById('aiModal');
        const openBtn = document.getElementById('openAiModalBtn');
        const closeBtn = document.querySelector('.close-modal');
        const copyBtn = document.getElementById('copyPromptBtn');
        const applyBtn = document.getElementById('applyAiDataBtn');
        const jsonInput = document.getElementById('aiJsonInput');

        // Открытие
        openBtn.onclick = () => {
            modal.style.display = "block";
            jsonInput.value = ""; // Очищаем поле при открытии
        };

        // Закрытие (крестик)
        closeBtn.onclick = () => {
            modal.style.display = "none";
        };

        // Закрытие (клик вне окна)
        window.onclick = (event) => {
            if (event.target == modal) {
                modal.style.display = "none";
            }
        };

        // Копирование промпта
        copyBtn.onclick = () => {
            const promptText = document.getElementById('aiPromptText').innerText;
            navigator.clipboard.writeText(promptText).then(() => {
                copyBtn.innerText = "Skopiowano!";
                setTimeout(() => copyBtn.innerText = "Kopiuj", 2000);
            });
        };

        // Применение JSON
        applyBtn.onclick = () => {
            const rawJson = jsonInput.value.trim();
            if (!rawJson) return;

            try {
                // Пытаемся почистить JSON (иногда Gemini добавляет ```json ... ```)
                let cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleanJson);

                // Если все ок, обновляем данные модели
                const data = window.currentInvoiceData;

                if (parsed.name) data.seller.name = parsed.name;
                if (parsed.taxId) data.seller.taxId = parsed.taxId;
                if (parsed.address) data.seller.addressFull = parsed.address;

                // Обновляем UI (Инпуты)
                document.getElementById('sellerName').value = data.seller.name;
                document.getElementById('sellerTaxId').value = data.seller.taxId;
                document.getElementById('sellerAddress').value = data.seller.addressFull;

                // Обновляем "сырой" текст для PDF
                updateSellerRawText();

                // Закрываем окно
                modal.style.display = "none";
                alert("Dane sprzedawcy zostały zaktualizowane!");

            } catch (e) {
                console.error(e);
                alert("Błąd parsowania JSON! Sprawdź czy skopiowałeś poprawny format z Gemini.");
            }
        };
    }

    function updateSellerRawText() {
        const s = window.currentInvoiceData.seller;
        const taxLine = s.taxId ? `VAT ID: ${s.taxId}` : "";
        s.rawText = [s.name, taxLine, s.addressFull].filter(Boolean).join('\n');
    }

    function bindInput(id, initialValue, updateCallback) {
        const el = document.getElementById(id);
        if (el) {
            el.value = initialValue;
            el.addEventListener('input', (e) => updateCallback(e.target.value));
        }
    }

    function renderItemsTable() {
        const tbody = document.getElementById('itemsList');
        tbody.innerHTML = '';

        window.currentInvoiceData.lineItems.forEach((item) => {
            const tr = document.createElement('tr');

            const tdLink = document.createElement('td');
            tdLink.style.textAlign = 'center';
            if (item.productUrl) {
                const a = document.createElement('a');
                a.href = item.productUrl;
                a.target = "_blank";
                a.className = "link-icon";
                a.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
                tdLink.appendChild(a);
            }
            tr.appendChild(tdLink);

            const tdName = document.createElement('td');
            const inputName = document.createElement('input');
            inputName.value = item.description;
            inputName.oninput = (e) => { item.description = e.target.value; };
            tdName.appendChild(inputName);
            tr.appendChild(tdName);

            const tdQty = document.createElement('td');
            const inputQty = document.createElement('input');
            inputQty.type = "number";
            inputQty.className = "qty";
            inputQty.value = item.quantity;
            inputQty.oninput = (e) => {
                item.quantity = parseFloat(e.target.value) || 0;
                recalculateRow(item);
            };
            tdQty.appendChild(inputQty);
            tr.appendChild(tdQty);

            const tdPrice = document.createElement('td');
            const inputPrice = document.createElement('input');
            inputPrice.type = "number";
            inputPrice.className = "price";
            inputPrice.step = "0.01";
            inputPrice.value = item.grossUnitPrice.toFixed(2);
            inputPrice.oninput = (e) => {
                item.grossUnitPrice = parseFloat(e.target.value) || 0;
                recalculateRow(item);
            };
            tdPrice.appendChild(inputPrice);
            tr.appendChild(tdPrice);

            const tdTotal = document.createElement('td');
            const inputTotal = document.createElement('input');
            inputTotal.className = "price";
            inputTotal.disabled = true;
            inputTotal.value = item.totalGross.toFixed(2);
            item._domTotal = inputTotal;
            tdTotal.appendChild(inputTotal);
            tr.appendChild(tdTotal);

            tbody.appendChild(tr);
        });
    }

    function recalculateRow(item) {
        item.totalGross = item.quantity * item.grossUnitPrice;
        if(item._domTotal) item._domTotal.value = item.totalGross.toFixed(2);
        updateTotalDisplay();
    }

    function updateTotalDisplay() {
        const totalGross = window.currentInvoiceData.lineItems.reduce((acc, item) => acc + item.totalGross, 0);
        const vatAmount = window.currentInvoiceData.totalVatAmount;
        const totalNet = totalGross - vatAmount;

        window.currentInvoiceData.totals = {
            totalNet: totalNet,
            totalVat: vatAmount,
            totalGross: totalGross
        };

        document.getElementById('displayGross').innerText = totalGross.toFixed(2);
        document.getElementById('displayNet').innerText = totalNet.toFixed(2);
    }

    document.getElementById('generatePdfBtn').addEventListener('click', () => {
        const data = window.currentInvoiceData;

        const tableBody = [
            [
                { text: 'Nazwa towaru / usługi', style: 'tableHeader' },
                { text: 'Il.', style: 'tableHeader', alignment: 'center' },
                { text: 'Cena Brutto', style: 'tableHeader', alignment: 'right' },
                { text: 'Wartość Brutto', style: 'tableHeader', alignment: 'right' }
            ]
        ];

        data.lineItems.forEach(item => {
            tableBody.push([
                { text: item.description, fontSize: 9 },
                { text: item.quantity.toString(), alignment: 'center' },
                { text: item.grossUnitPrice.toFixed(2), alignment: 'right' },
                { text: item.totalGross.toFixed(2), alignment: 'right', bold: true }
            ]);
        });

        const parseAddressBox = (rawText) => {
            const lines = (rawText || "").split('\n');
            const name = lines[0] || "";
            const rest = lines.slice(1).join('\n');
            return { name, rest };
        };
        const sellerInfo = parseAddressBox(data.seller.rawText);
        const buyerInfo = parseAddressBox(data.buyer.rawText);

        const docDefinition = {
            content: [
                { text: 'FAKTURA', style: 'header', alignment: 'right' },
                { text: `Nr: ${data.invoiceHeader.invoiceNumber}`, alignment: 'right', bold: true },
                { text: `Data wystawienia: ${data.invoiceHeader.issueDate}`, alignment: 'right', fontSize: 10 },
                { text: `Data sprzedaży: ${data.invoiceHeader.saleDate}`, alignment: 'right', margin: [0,0,0,20], fontSize: 10 },

                {
                    columns: [
                        { width: '*', text: [{text:'Sprzedawca:\n',style:'label'}, {text:sellerInfo.name+'\n',bold:true}, sellerInfo.rest] },
                        { width: '*', text: [{text:'Nabywca:\n',style:'label'}, {text:buyerInfo.name+'\n',bold:true}, buyerInfo.rest], alignment: 'right' }
                    ]
                },
                { text: '\n\n' },

                {
                    table: {
                        headerRows: 1,
                        widths: ['*', 'auto', 'auto', 'auto'],
                        body: tableBody
                    },
                    layout: 'lightHorizontalLines'
                },
                { text: '\n' },

                {
                    columns: [
                        { width: '*', text: '' },
                        {
                            width: 'auto',
                            table: {
                                widths: ['auto', 'auto'],
                                body: [
                                    [{ text: 'Suma Netto:', alignment: 'right' }, { text: `${data.totals.totalNet.toFixed(2)} PLN`, alignment: 'right' }],
                                    [{ text: 'Kwota VAT:', alignment: 'right' }, { text: `${data.totals.totalVat.toFixed(2)} PLN`, alignment: 'right' }],
                                    [{ text: 'RAZEM (Brutto):', bold: true, alignment: 'right', fillColor: '#f0f0f0' }, { text: `${data.totals.totalGross.toFixed(2)} PLN`, bold: true, fontSize: 12, alignment: 'right', fillColor: '#f0f0f0' }]
                                ]
                            },
                            layout: 'noBorders'
                        }
                    ]
                },

                { text: `\nID Zamówienia: ${data.invoiceHeader.orderId}`, fontSize: 9, color: 'gray', margin: [0,20,0,0] },
                { text: `Źródło: ${data.sourceUrl}`, fontSize: 8, color: 'gray', link: data.sourceUrl }
            ],
            styles: {
                header: { fontSize: 22, bold: true },
                label: { fontSize: 10, color: 'gray', italics: true },
                tableHeader: { bold: true, fontSize: 11, fillColor: '#f0f0f0' }
            },
            defaultStyle: { fontSize: 10 }
        };

        try {
            pdfMake.createPdf(docDefinition).download(`Faktura_${data.invoiceHeader.invoiceNumber}.pdf`);
        } catch (e) {
            console.error(e);
            alert("Błąd generowania PDF!");
        }
    });
});