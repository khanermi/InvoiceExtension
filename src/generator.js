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

        openBtn.onclick = () => {
            modal.style.display = "block";
            jsonInput.value = "";
        };

        closeBtn.onclick = () => modal.style.display = "none";
        window.onclick = (event) => {
            if (event.target == modal) modal.style.display = "none";
        };

        copyBtn.onclick = () => {
            const promptText = document.getElementById('aiPromptText').innerText;
            navigator.clipboard.writeText(promptText).then(() => {
                const originalHtml = copyBtn.innerHTML;
                copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                copyBtn.style.borderColor = "#2e7d32";

                setTimeout(() => {
                    copyBtn.innerHTML = originalHtml;
                    copyBtn.style.borderColor = "";
                }, 2000);
            });
        };

        // Применение JSON
        applyBtn.onclick = () => {
            const rawJson = jsonInput.value.trim();
            if (!rawJson) return;

            try {
                let cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleanJson);

                const data = window.currentInvoiceData;

                if (parsed.name) data.seller.name = parsed.name;
                if (parsed.taxId) data.seller.taxId = parsed.taxId;
                if (parsed.address) data.seller.addressFull = parsed.address;

                document.getElementById('sellerName').value = data.seller.name;
                document.getElementById('sellerTaxId').value = data.seller.taxId;
                document.getElementById('sellerAddress').value = data.seller.addressFull;

                updateSellerRawText();

                // Закрываем окно БЕЗ алерта
                modal.style.display = "none";

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
        const aliExpressLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="57.573334mm" height="13.387917mm" viewBox="0 0 57.573334 13.387917"><style type="text/css">.st0{fill:#E43225;} .st1{fill:#F7971D;}</style><g transform="translate(-76.290715,-142.89532)"><g transform="matrix(0.26458333,0,0,0.26458333,38.931549,83.337617)"><g><path class="st0" d="m 195.5,262.8 v -33.5 h 19.8 v 4.2 h -15.7 v 10.3 h 14.1 v 4.2 h -14.1 v 10.5 h 16.8 v 4.2 h -20.9 z"/><path class="st0" d="m 237.2,262.8 -6.8,-8.9 -6.8,8.9 h -4.8 l 9.3,-11.9 -9.8,-12.3 h 5.4 l 6.7,9.2 6.8,-9.2 h 5.3 l -9.3,12.3 8.8,11.9 z"/><path class="st0" d="m 248.6,259.2 v 16.5 h -4.1 V 251 c 0,-6.3 4.8,-13 12.3,-13 7.6,0 13.3,4.8 13.3,12.7 0,7.7 -5.8,13 -12.4,13 -3.2,0 -7.5,-1.4 -9.1,-4.5 z m 17.2,-8.5 c 0,-5.4 -3.5,-8.6 -9.7,-8.3 -3,0.1 -7.6,2.3 -7.2,10 0.1,2.5 2.7,7.2 8.4,7.2 4.9,0 8.5,-2.8 8.5,-8.9 z"/><path class="st0" d="m 273.6,262.8 v -24.2 h 4.1 v 2.6 c 2,-2.3 5.1,-3.1 8.4,-3.1 v 4.4 c -0.5,-0.1 -5.4,-0.7 -8.4,5.7 v 14.7 h -4.1 z"/><path class="st0" d="m 287.2,250.7 c 0,-7 5,-12.7 11.9,-12.7 8.6,0 11.8,5.7 11.8,13 v 2 h -19.2 c 0.3,4.6 4.4,7 8.2,6.9 2.8,-0.1 4.7,-0.9 6.7,-2.9 l 2.7,2.8 c -2.5,2.4 -5.7,4 -9.6,4 -7.3,-0.1 -12.5,-5.5 -12.5,-13.1 z m 11.6,-8.6 c -3.9,0 -6.9,3.4 -7.1,7.1 h 14.9 c 0,-3.6 -2.6,-7.1 -7.8,-7.1 z"/><path class="st0" d="m 313,259.4 c 0,0 3,-2.7 3,-2.7 -0.1,0 1.5,1.6 1.7,1.7 0.7,0.6 1.4,1 2.3,1.2 2.6,0.7 7.3,0.5 7.7,-3.1 0.2,-2 -1.3,-3.1 -3,-3.8 -2.2,-0.8 -4.6,-1.1 -6.8,-2.1 -2.5,-1.1 -4.1,-3 -4.1,-5.8 0,-7.3 10.4,-8.5 15.1,-5.1 0.2,0.2 2.5,2.3 2.4,2.3 l -3,2.4 c -1.5,-1.8 -2.9,-2.7 -6.1,-2.7 -1.6,0 -3.8,0.7 -4.2,2.4 -0.6,2.4 2.1,3.3 3.9,3.8 2.4,0.6 5,1 7.1,2.3 2.9,1.8 3.6,5.7 2.5,8.7 -1.2,3.3 -4.8,4.6 -8,4.7 -3.8,0.2 -7.1,-1 -9.8,-3.7 -0.2,0 -0.7,-0.5 -0.7,-0.5 z"/><path class="st0" d="m 334.1,259.4 c 0,0 3,-2.7 3,-2.7 -0.1,0 1.5,1.6 1.7,1.7 0.7,0.6 1.4,1 2.3,1.2 2.6,0.7 7.3,0.5 7.7,-3.1 0.2,-2 -1.3,-3.1 -3,-3.8 -2.2,-0.8 -4.6,-1.1 -6.8,-2.1 -2.5,-1.1 -4.1,-3 -4.1,-5.8 0,-7.3 10.4,-8.5 15.1,-5.1 0.2,0.2 2.5,2.3 2.4,2.3 l -3,2.4 c -1.5,-1.8 -2.9,-2.7 -6.1,-2.7 -1.6,0 -3.8,0.7 -4.2,2.4 -0.6,2.4 2.1,3.3 3.9,3.8 2.4,0.6 5,1 7.1,2.3 2.9,1.8 3.6,5.7 2.5,8.7 -1.2,3.3 -4.8,4.6 -8,4.7 -3.8,0.2 -7.1,-1 -9.8,-3.7 -0.2,0 -0.7,-0.5 -0.7,-0.5 z"/><g><path class="st0" d="M 353.6,238.6 V 236 h -0.9 v -0.5 h 2.4 v 0.5 h -0.9 v 2.6 z"/><path class="st0" d="m 358.1,238.6 v -2.4 l -0.9,2.4 H 357 l -0.9,-2.4 v 2.4 h -0.5 v -3.1 h 0.8 l 0.8,2.1 0.8,-2.1 h 0.8 v 3.1 z"/></g></g><g><path class="st1" d="m 167.7,262.8 -3,-8 h -16.2 l -3,8 h -4.3 l 13,-33.5 h 4.7 l 12.9,33.5 z m -11.3,-28.7 -6.1,16.6 H 163 Z"/><path class="st1" d="m 174.5,262.8 v -33.5 h 4.2 v 33.5 z"/><path class="st1" d="m 185,262.8 v -23.7 h 4.2 v 23.7 z"/><path class="st1" d="m 193.2,231.4 c 0,-0.1 0,-0.1 0,-0.2 0,-0.1 0,-0.1 0,-0.2 -3.2,-0.1 -5.8,-2.7 -5.9,-5.9 -0.1,0 -0.2,0 -0.3,0 -0.1,0 -0.2,0 -0.3,0 -0.1,3.2 -2.7,5.8 -5.9,5.9 0,0.1 0,0.1 0,0.2 0,0.1 0,0.1 0,0.2 3.2,0.1 5.8,2.7 5.9,5.9 0.1,0 0.2,0 0.3,0 0.1,0 0.2,0 0.3,0 0.1,-3.2 2.7,-5.8 5.9,-5.9 z"/></g></g></g></svg>`;
        
        const docDefinition = {
            content: [
                {
                    columns: [
                        {
                            // Левая колонка: Логотип
                            // fit: [ширина, высота] ограничивает размер логотипа
                            svg: aliExpressLogoSvg,
                            width: 150,
                            margin: [0, 0, 0, 0]
                        },
                        {
                            // Правая колонка: Заголовок счета
                            // Используем stack, чтобы сохранить вертикальный список справа
                            width: '*',
                            stack: [
                                { text: 'FAKTURA', style: 'header', alignment: 'right' },
                                { text: `Nr: ${data.invoiceHeader.invoiceNumber}`, alignment: 'right', bold: true },
                                { text: `Data wystawienia: ${data.invoiceHeader.issueDate}`, alignment: 'right', fontSize: 10 },
                                { text: `Data sprzedaży: ${data.invoiceHeader.saleDate}`, alignment: 'right', margin: [0, 0, 0, 20], fontSize: 10 }
                            ]
                        }
                    ],
                    columnGap: 10 // Отступ между лого и текстом
                },

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