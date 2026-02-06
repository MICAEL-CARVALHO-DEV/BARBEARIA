// URL base para o futuro back-end em Python
const API_URL = "http://127.0.0.1:5000"; 

let usuarioAtivo = JSON.parse(localStorage.getItem('usuarioLogado')) || null;
let agendamentoLocal = { servico: "", valor: 0, dia: "", hora: "", pagamento: "Presencial" };

// Carrega serviços criados no Admin ou usa padrão
let listaServicos = JSON.parse(localStorage.getItem('listaServicos')) || [
    { id: 1, nome: "Corte Social", preco: 35.00 }
];

document.addEventListener("DOMContentLoaded", () => {
    if (usuarioAtivo) exibirPainelAgendamento();
});

function fazerLogin() {
    const nome = document.getElementById('login-nome').value;
    const tel = document.getElementById('login-tel').value;
    if (!nome || tel.length < 10) return alert("Preencha nome e WhatsApp!");
    
    usuarioAtivo = { nome, tel };
    localStorage.setItem('usuarioLogado', JSON.stringify(usuarioAtivo));
    exibirPainelAgendamento();
}

// 2 - Função de Saída (Logout)
function logout() {
    localStorage.removeItem('usuarioLogado');
    location.reload(); 
}

function exibirPainelAgendamento() {
    document.getElementById('tela-login').style.display = 'none';
    document.getElementById('tela-agendamento').style.display = 'block';

    // 1. Mostra o botão de emoji global
    document.getElementById('btn-logout-global').style.display = 'block';
    
    // 2. Nome sempre MAIÚSCULO
    const nomeUpper = usuarioAtivo.nome.toUpperCase();
    document.getElementById('user-display-name').innerText = `OLÁ, ${nomeUpper}`;
    
    renderizarServicosCliente();
    renderizarCalendario();
    renderizarHorarios();
}

function logout() {
    localStorage.removeItem('usuarioLogado');
    // 3. Esconde o botão ao sair e recarrega
    document.getElementById('btn-logout-global').style.display = 'none';
    location.reload(); 
}

function renderizarServicosCliente() {
    const container = document.getElementById('lista-servicos-cliente');
    container.innerHTML = listaServicos.map(s => `
        <div class="srv-item-cliente" onclick="selecionarServico(this, '${s.nome}', ${s.preco})">
            <span>${s.nome}</span>
            <strong>R$ ${s.preco.toFixed(2)}</strong>
        </div>
    `).join('');
}

function selecionarServico(el, nome, preco) {
    document.querySelectorAll('.srv-item-cliente').forEach(c => c.classList.remove('selecionado'));
    el.classList.add('selecionado');
    agendamentoLocal.servico = nome;
    agendamentoLocal.valor = preco;
}

// 5 - Renderizar como Calendário (Grade com dia e mês)
function renderizarCalendario() {
    const cal = document.getElementById('calendario');
    cal.innerHTML = "";
    const hoje = new Date();
    
    for (let i = 0; i < 12; i++) { // Mostra os próximos 12 dias
        const dataBoneco = new Date();
        dataBoneco.setDate(hoje.getDate() + i);
        
        const diaNum = dataBoneco.getDate();
        const mesNum = (dataBoneco.getMonth() + 1).toString().padStart(2, '0');

        const div = document.createElement('div');
        div.className = 'day';
        div.innerHTML = `<strong>${diaNum}</strong><br><small>${mesNum}</small>`;
        
        div.onclick = () => {
            document.querySelectorAll('.day').forEach(d => d.classList.remove('selecionado'));
            div.classList.add('selecionado');
            agendamentoLocal.dia = `${diaNum}/${mesNum}`;
        };
        cal.appendChild(div);
    }
}

function renderizarHorarios() {
    const grade = document.getElementById('grade-horarios');
    const horas = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
    grade.innerHTML = horas.map(h => `<div class="time-slot" onclick="selecionarHora(this, '${h}')">${h}</div>`).join('');
}

function selecionarHora(el, hora) {
    document.querySelectorAll('.time-slot').forEach(t => t.classList.remove('selecionado'));
    el.classList.add('selecionado');
    agendamentoLocal.hora = hora;
}

// Gancho pronto para o Back-end (POST)
async function confirmarAgendamento() {
    if (!agendamentoLocal.servico || !agendamentoLocal.dia || !agendamentoLocal.hora) {
        return alert("Selecione serviço, dia e hora!");
    }
    agendamentoLocal.pagamento = document.getElementById('metodo-pagamento').value;
    
    const dadosCompletos = { ...usuarioAtivo, ...agendamentoLocal, id: Date.now() };

    try {
        /* Quando o colega ligar o Python, descomente as linhas abaixo:
        const response = await fetch(`${API_URL}/agendamentos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosCompletos)
        });
        */

        // Por enquanto, mantemos o LocalStorage para teste
        let db = JSON.parse(localStorage.getItem('agendamentosAdmin')) || [];
        db.push(dadosCompletos);
        localStorage.setItem('agendamentosAdmin', JSON.stringify(db));
        
        document.getElementById('tela-agendamento').style.display = 'none';
        document.getElementById('tela-pix').style.display = 'block';

    } catch (error) {
        console.error("Erro ao conectar com o Python:", error);
        alert("Erro no servidor.");
    }
}

// 1 - Histórico com QUANTIDADE de cortes
function toggleHistorico() {
    const hist = document.getElementById('conteudo-historico');
    hist.classList.toggle('ativo');
    
    if (hist.classList.contains('ativo')) {
        const lista = document.getElementById('lista-animada-hist');
        
        // Simulação de busca no banco de dados
        let db = JSON.parse(localStorage.getItem('agendamentosAdmin')) || [];
        let meusCortes = db.filter(a => a.tel === usuarioAtivo.tel);
        
        // Mostra a contagem de cortes no topo
        lista.innerHTML = `
            <div style="padding: 10px; background: #222; border-radius: 8px; margin-bottom: 15px; border: 1px solid var(--primary);">
                <span style="color: var(--primary); font-weight: bold;">📊 Total de cortes: ${meusCortes.length}</span>
            </div>
            ${meusCortes.map(a => `
                <div class="cliente-item">
                    <span>${a.servico}</span>
                    <small>${a.dia} - ${a.hora}</small>
                </div>
            `).join('')}
        `;
    }
}

function enviarWhatsappConfirmacao() {
    const texto = `Olá, agendei ${agendamentoLocal.servico} para dia ${agendamentoLocal.dia} às ${agendamentoLocal.hora}.`;
    window.open(`https://wa.me/5511999999999?text=${encodeURIComponent(texto)}`);
}