const API_BASE_URL = "http://localhost/skarbiecKlubu/api";

async function parseResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    const erroTratado = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      erro: erroTratado || "Resposta inválida do servidor.",
    };
  }
}

function extrairEndpoint(endpoint) {
  return String(endpoint).split("?")[0];
}

async function registrarLogAutomatico(endpoint, payload, resultado) {
  const endpointBase = extrairEndpoint(endpoint);

  if (endpointBase === "historico.php" || endpointBase === "log_evento.php") {
    return;
  }

  try {
    await fetch(`${API_BASE_URL}/log_evento.php`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: endpointBase, payload, resultado }),
    });
  } catch (error) {
    console.warn("Não foi possível registrar o histórico:", error);
  }
}

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(data.erro || "Erro ao processar a requisição.");
  }

  if ((options.method || "GET").toUpperCase() !== "GET") {
    let payload = null;
    try {
      payload = options.body ? JSON.parse(options.body) : null;
    } catch {
      payload = null;
    }
    registrarLogAutomatico(endpoint, payload, data);
  }

  return data;
}

export async function get(endpoint) {
  return request(endpoint, { method: "GET" });
}

export async function post(endpoint, payload = {}) {
  return request(endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function registrarMovimentacao(payload) {
  return post("movimentacao.php", payload);
}

export async function listarCategorias() {
  return get("categoria.php");
}

export async function criarCategoria(payload) {
  return post("categoria.php", payload);
}

export async function listarCargos() {
  return get("cargo.php");
}

export async function criarCargo(payload) {
  return post("cargo.php", payload);
}

export async function listarMembrosClube() {
  return get("membro_clube.php");
}

export async function adicionarMembroClube(payload) {
  return post("membro_clube.php", payload);
}

export async function obterClubeAtual() {
  return get("clube.php");
}

export async function listarProdutos() {
  return get("produtos.php");
}

export async function criarProduto(payload) {
  return post("produtos.php", payload);
}

export async function movimentarProduto(payload) {
  return post("produtos.php", {
    acao: "movimentar",
    ...payload,
  });
}

export async function editarProduto(payload) {
  return post("produtos.php", {
    acao: "editar",
    ...payload,
  });
}

export async function listarMensalidades() {
  return get("mensalidades.php");
}

export async function configurarMensalidadePadrao(payload) {
  return post("mensalidades.php", {
    acao: "configurar_valor",
    ...payload,
  });
}

export async function cadastrarMembroMensalidade(payload) {
  return post("mensalidades.php", {
    acao: "cadastrar_membro",
    ...payload,
  });
}

export async function gerarMensalidade(payload) {
  return post("mensalidades.php", {
    acao: "gerar_mensalidade",
    ...payload,
  });
}

export async function atualizarStatusMensalidade(payload) {
  return post("mensalidades.php", {
    acao: "atualizar_status",
    ...payload,
  });
}

export async function listarHistorico(filtros = {}) {
  const params = new URLSearchParams();

  Object.entries(filtros).forEach(([chave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== "") {
      params.append(chave, String(valor));
    }
  });

  const query = params.toString();
  return get(`historico.php${query ? `?${query}` : ""}`);
}

export async function listarEventos() {
  return get("eventos.php");
}

export async function buscarClubesEvento(q) {
  return get(`eventos.php?acao=buscar_clubes&q=${encodeURIComponent(q)}`);
}

export async function criarEvento(payload) {
  return post("eventos.php", { acao: "criar", ...payload });
}

export async function detalharEvento(eventoId) {
  return get(`eventos.php?acao=detalhe&evento_id=${encodeURIComponent(eventoId)}`);
}

export async function relatorioEvento(eventoId) {
  return get(`eventos.php?acao=relatorio&evento_id=${encodeURIComponent(eventoId)}`);
}

export async function criarProdutoEvento(payload) {
  return post("eventos.php", { acao: "criar_produto_evento", ...payload });
}

export async function movimentarProdutoEvento(payload) {
  return post("eventos.php", { acao: "movimentar_produto", ...payload });
}

export async function finalizarEvento(eventoId) {
  return post("eventos.php", { acao: "finalizar", evento_id: eventoId });
}

export async function enviarRepasseEvento(payload) {
  return post("eventos.php", { acao: "enviar_repasse", ...payload });
}

export async function verificarAlertaEvento(alertaId) {
  return post("eventos.php", { acao: "verificar_alerta", alerta_id: alertaId });
}


export async function listarGastosFixos(mes) {
  const query = mes ? `?mes=${encodeURIComponent(mes)}` : "";
  return get(`gastos_fixos.php${query}`);
}

export async function cadastrarGastoFixo(payload) {
  return post("gastos_fixos.php", { acao: "cadastrar", ...payload });
}

export async function editarGastoFixo(payload) {
  return post("gastos_fixos.php", { acao: "editar", ...payload });
}

export async function marcarGastoFixoPago(id) {
  return post("gastos_fixos.php", { acao: "marcar_pago", id });
}

export async function desmarcarGastoFixoPago(id) {
  return post("gastos_fixos.php", { acao: "desmarcar_pago", id });
}

export async function listarFiltrosRelatorio() {
  return get("relatorios.php?acao=filtros");
}

export async function gerarRelatorioGeral(filtros = {}) {
  const params = new URLSearchParams();

  Object.entries(filtros).forEach(([chave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== "") {
      params.append(chave, String(valor));
    }
  });

  const query = params.toString();
  return get(`relatorios.php${query ? `?${query}` : ""}`);
}
