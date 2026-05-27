async function fazerLogin() {
    const mensagem = document.getElementById('mensagem')
    const clube = document.getElementById('input-clube').value.trim()
    const email = document.getElementById('input-email').value.trim()
    const senha = document.getElementById('input-senha').value

    mensagem.className = 'mensagem oculto'
    mensagem.textContent = ''

    if (!clube || !email || !senha) {
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

    const response = await fetch("http://localhost/skarbiecKlubu/api/login.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clube, email, senha })
    })

    const data = await response.json()

    if (data.erro) {
        mensagem.className = 'mensagem erro'
        mensagem.textContent = data.erro
        return
    }

    window.location.href = "http://localhost:5173/";}