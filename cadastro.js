async function fazerCadastro() {
    const mensagem = document.getElementById('mensagem')
    const nome = document.getElementById('input-nome').value.trim()
    const sobrenome = document.getElementById('input-sobrenome').value.trim()
    const email = document.getElementById('input-email').value.trim()
    const senha = document.getElementById('input-senha').value
    const senha2 = document.getElementById('input-senha2').value
    console.log("VERSAO NOVA")
    mensagem.className = 'mensagem oculto'
    mensagem.textContent = ''

    if (!nome || !sobrenome || !email || !senha || !senha2) {
        mensagem.className = 'mensagem erro'
        mensagem.textContent = 'Preencha todos os campos antes de continuar.'
        return
    }

    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!emailValido) {
        mensagem.className = 'mensagem erro'
        mensagem.textContent = 'Informe um e-mail válido.'
        return
    }

    if (senha.length < 6) {
        mensagem.className = 'mensagem erro'
        mensagem.textContent = 'A senha deve ter pelo menos 6 caracteres.'
        return
    }

    if (senha !== senha2) {
        mensagem.className = 'mensagem erro'
        mensagem.textContent = 'As senhas não coincidem.'
        return
    }

    const clubeAberto = document.getElementById('corpo-clube').classList.contains('visivel')

    if (clubeAberto) {
        const clubeNome = document.getElementById('clube-nome-oficial').value.trim()
        const clubeCidade = document.getElementById('clube-cidade').value.trim()
        const clubeCodigo = document.getElementById('clube-codigo').value.trim()

        if (!clubeNome || !clubeCidade || !clubeCodigo) {
            mensagem.className = 'mensagem erro'
            mensagem.textContent = 'Preencha todos os campos do clube ou feche essa seção.'
            return
        }
    }

    const response = await fetch("http://localhost/skarbiecKlubu/api/cadastro.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            nome,
            sobrenome,
            email,
            senha,
            clube: clubeAberto ? {
                nome: document.getElementById('clube-nome-oficial').value,
                cidade: document.getElementById('clube-cidade').value,
                codigo: document.getElementById('clube-codigo').value
            } : null
        })
    })

    const data = await response.json()

    if (data.erro) {
        mensagem.className = 'mensagem erro'
        mensagem.textContent = data.erro
        return
    }

    mensagem.className = 'mensagem sucesso'

    if (clubeAberto) {
        mensagem.textContent = 'Clube criado com sucesso! Você já pode acessar o painel como administrador.'
    } else {
        mensagem.textContent = 'Conta criada! Aguarde a aprovação do seu clube para acessar o painel.'
    }

    setTimeout(() => {
        window.location.href = 'index.html'
    }, 1500)
}
function toggleCriarClube() {
    const corpo = document.getElementById('corpo-clube')
    const seta = document.getElementById('seta-clube')

    const aberto = corpo.classList.toggle('visivel')
    seta.classList.toggle('aberta', aberto)
}