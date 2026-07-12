// Teste rápido para verificar se o servidor aceita itemId
const payload = {
    itemId: '151',
    barcodes: ['TEST123'],
    quantity: 5
};

fetch('http://localhost:3000/api/inventario/item/update-barcodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
})
    .then(r => r.json())
    .then(data => {
        console.log('✅ SUCESSO! Servidor está atualizado:', data);
    })
    .catch(err => {
        console.error('❌ ERRO! Servidor ainda está com código antigo:', err);
    });
