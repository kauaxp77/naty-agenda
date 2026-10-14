// Testa o aviso por e-mail quando a Meta não entrega uma resposta do robô (status "failed").
// Uso: node test/testar_entrega.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { DateTime, Settings } = require('luxon');

Settings.now = () => new Date('2026-10-14T12:00:00-03:00').valueOf();

const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const rodar = (codigo, itens, nos = {}) =>
  new Function('$input', '$', 'DateTime', codigo)(
    { first: () => ({ json: itens[0] }), all: () => itens.map(json => ({ json })) },
    nome => ({ first: () => ({ json: nos[nome] }) }),
    DateTime,
  ).map(i => i.json);

// O que o gatilho do WhatsApp entrega quando a Meta avisa a falha (formato visto em 14/10/2026)
const status = (st, id, erro) => ({
  messaging_product: 'whatsapp', field: 'messages',
  metadata: { display_phone_number: '15550000000', phone_number_id: '123' },
  statuses: [{
    id, status: st, timestamp: '1791989242', recipient_id: '556181234567',
    ...(erro ? { errors: [erro] } : {}),
  }],
});
const BLOQUEADA = { code: 131031, title: 'Business Account locked', message: 'Business Account locked', error_data: { details: 'Business account has been locked.' } };

// 1. Normalizar: falha vira item com falhas_entrega; entregue/lido continua sendo ignorado
const n = rodar(src('01_normalizar.js'), [status('failed', 'wamid.A', BLOQUEADA)]);
assert.equal(n.length, 1);
assert.equal(n[0].canal, 'whatsapp_status');
assert.deepEqual(n[0].falhas_entrega.map(f => [f.para, f.codigo, f.titulo, f.detalhe]),
  [['556181234567', 131031, 'Business Account locked', 'Business account has been locked.']]);
assert.ok(n[0].falhas_entrega[0].quando_iso.startsWith('2026-10-14T11:47'), 'horário de Brasília');
assert.ok(n[0].email_naty, 'leva a configuração, para o e-mail saber o destinatário');
assert.equal(rodar(src('01_normalizar.js'), [status('delivered', 'wamid.B')]).length, 0, 'entregue não avisa');
assert.equal(rodar(src('01_normalizar.js'), [status('read', 'wamid.C')]).length, 0, 'lido não avisa');
// Várias falhas na mesma notificação viram um e-mail só
const duas = rodar(src('01_normalizar.js'), [status('failed', 'wamid.D', BLOQUEADA), status('failed', 'wamid.E', { code: 131047, title: 'Re-engagement message' })]);
assert.equal(duas.length, 1);
assert.equal(duas[0].falhas_entrega.length, 2);
console.log('ok  status "failed" vira aviso; "entregue" e "lido" são ignorados; várias falhas, um item');

// 2. E-mail
const email = rodar(src('07_aviso_nao_entregue.js'), [n[0]])[0];
assert.equal(email.assunto, '⚠️ Resposta do WhatsApp NÃO entregue');
assert.ok(email.html.includes('+556181234567'));
assert.ok(email.html.includes('quarta-feira, 14/10 às 11:47'), email.html);
assert.ok(email.html.includes('Erro 131031:</b> Business Account locked (Business account has been locked.)'), email.html);
assert.ok(email.html.includes('<b>bloqueou a conta</b>'), 'explica o código 131031');
assert.ok(email.html.includes('confira a agenda'));
const email2 = rodar(src('07_aviso_nao_entregue.js'), [duas[0]])[0];
assert.equal(email2.assunto, '⚠️ Resposta do WhatsApp NÃO entregue (2)');
assert.ok(email2.html.includes('<b>mais de 24 horas</b>'), 'explica o código 131047');
const estranho = rodar(src('07_aviso_nao_entregue.js'), [{ ...n[0], falhas_entrega: [{ ...n[0].falhas_entrega[0], codigo: 999, titulo: '<script>' }] }])[0];
assert.ok(estranho.html.includes('Erro 999:</b> &lt;script&gt;') && !estranho.html.includes('<script>'), 'HTML escapado; código desconhecido sem dica');
console.log('ok  e-mail com número, horário em Brasília, erro e o que fazer');

// 3. Workflow: o desvio vem antes dos comandos e da IA, e o gatilho só repassa falhas
const wf = require('../workflow-naty-agenda.json');
const con = wf.connections;
assert.equal(con['Normalizar entrada'].main[0][0].node, 'Resposta não entregue?');
assert.equal(con['Resposta não entregue?'].main[0][0].node, 'Montar aviso de não entrega');
assert.equal(con['Resposta não entregue?'].main[1][0].node, 'É comando?', 'mensagem normal segue o caminho de sempre');
assert.equal(con['Montar aviso de não entrega'].main[0][0].node, 'E-mail: resposta não entregue');
const gatilho = wf.nodes.find(x => x.name === 'WhatsApp: novo pedido');
assert.deepEqual(gatilho.parameters.options.messageStatusUpdates, ['failed']);
console.log('ok  workflow: falha de entrega desvia antes dos comandos; gatilho só com "failed"');

console.log('\nTodos os testes de entrega passaram.');
