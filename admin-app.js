let transacoes = JSON.parse(localStorage.getItem('transacoes')) || [];
let listaServicos = JSON.parse(localStorage.getItem('listaServicos')) || [
    { id: 1, nome: "Corte Social", preco: 35.00 }
];
const metaDiaria = 300;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('data-atual-topo').innerText = new Date().toLocaleDateString('pt-BR');
    renderizarTudo();
});

function renderizarTudo() {
    renderizarAgenda();
    renderizarServicosAdmin();
    renderizarCalendario();
    atualizarFinanceiro();
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById('tab-' + tabId).style.display = 'block';
}

function renderizarCalendario() {
    const cal = document.getElementById('calendario-trabalho');
    if(!cal) return;
    cal.innerHTML = "";
    const diaHoje = new Date().getDate();
    for (let i = 1; i <= 31; i++) {
        const div = document.createElement('div');
        div.className = `day-work ${i === diaHoje ? 'hoje' : ''} ${i < diaHoje ? 'trabalhado' : ''}`;
        div.innerText = i;
        cal.appendChild(div);
    }
}

function renderizarAgenda() {
    const container = document.getElementById('lista-agendamentos-admin');
    const agendamentos = JSON.parse(localStorage.getItem('agendamentosAdmin')) || [];
    if (agendamentos.length === 0) {
        container.innerHTML = "<p style='text-align:center; opacity:0.5; padding:20px;'>Nenhum agendamento pendente.</p>";
        return;
    }
    container.innerHTML = agendamentos.map((ag, index) => `
        <div class="cliente-item">
            <div>
                <strong>${ag.nome}</strong> <small>(${ag.tel})</small><br>
                <span>${ag.servico} - ${ag.dia} às ${ag.hora}</span>
            </div>
            <button onclick="concluirServico(${index})" class="btn-save" style="width:auto; padding:8px 15px;">✔️ OK</button>
        </div>
    `).join('');
}

function concluirServico(index) {
    let agendamentos = JSON.parse(localStorage.getItem('agendamentosAdmin')) || [];
    const servicoConcluido = agendamentos[index];
    
    transacoes.push({
        cliente: servicoConcluido.nome,
        valor: parseFloat(servicoConcluido.valor),
        metodo: servicoConcluido.pagamento || "Dinheiro",
        data: new Date().toLocaleDateString('pt-BR')
    });

    agendamentos.splice(index, 1);
    localStorage.setItem('agendamentosAdmin', JSON.stringify(agendamentos));
    localStorage.setItem('transacoes', JSON.stringify(transacoes));
    renderizarTudo();
}

function atualizarFinanceiro() {
    let res = { Dinheiro: 0, Pix: 0, Cartão: 0, Total: 0 };
    const listaHist = document.getElementById('historico-financeiro-lista');
    if(listaHist) listaHist.innerHTML = "";

    transacoes.forEach(t => {
        const m = t.metodo === "Pix" ? "Pix" : (t.metodo === "Cartão" ? "Cartão" : "Dinheiro");
        res[m] += t.valor;
        res.Total += t.valor;
        if(listaHist) {
            listaHist.innerHTML += `<div class="cliente-item"><span>${t.cliente}</span><span>${m}: R$ ${t.valor.toFixed(2)}</span></div>`;
        }
    });

    // Atualiza cards de ganhos (Dashboard)
    document.getElementById('faturamento-dia').innerText = `R$ ${res.Total.toFixed(0)}`;
    document.getElementById('total-cortes-stats').innerText = transacoes.length;

    // Atualiza Aba Financeiro
    document.getElementById('valor-dinheiro').innerText = `R$ ${res.Dinheiro.toFixed(2)}`;
    document.getElementById('valor-pix').innerText = `R$ ${res.Pix.toFixed(2)}`;
    document.getElementById('valor-cartao').innerText = `R$ ${res.Cartão.toFixed(2)}`;
    document.getElementById('total-geral-caixa').innerText = `R$ ${res.Total.toFixed(2)}`;

    // Atualizar Barra de Meta
    const porc = Math.min((res.Total / metaDiaria) * 100, 100);
    document.getElementById('fill-meta').style.width = porc + "%";
    document.getElementById('porcentagem-meta').innerText = Math.floor(porc) + "%";
}

// Funções de Serviço (Inalteradas como solicitado)
function renderizarServicosAdmin() {
    const container = document.getElementById('lista-servicos-admin');
    container.innerHTML = listaServicos.map((s, index) => `
        <div class="card-servico-admin">
            <div class="srv-detalhes">
                <strong>${s.nome}</strong><br>
                <span>R$ ${s.preco.toFixed(2)}</span>
            </div>
            <button onclick="removerServico(${index})" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:1.2rem;">🗑️</button>
        </div>
    `).join('');
}

function abrirModalServico() { document.getElementById('modal-servico').style.display = 'flex'; }
function fecharModalServico() { document.getElementById('modal-servico').style.display = 'none'; }

function salvarServico() {
    const nome = document.getElementById('srv-nome').value;
    const preco = parseFloat(document.getElementById('srv-preco').value);
    if(!nome || !preco) return alert("Preencha tudo!");
    listaServicos.push({ id: Date.now(), nome, preco });
    localStorage.setItem('listaServicos', JSON.stringify(listaServicos));
    fecharModalServico();
    renderizarTudo();
}

function removerServico(index) {
    listaServicos.splice(index, 1);
    localStorage.setItem('listaServicos', JSON.stringify(listaServicos));
    renderizarTudo();
}

function zerarDados() {
    if(confirm("Deseja zerar o caixa e histórico?")) {
        localStorage.removeItem('transacoes');
        transacoes = [];
        renderizarTudo();
    }
}