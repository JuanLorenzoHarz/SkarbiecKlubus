import { useEffect, useMemo, useState } from "react";
import { gerarRelatorioGeral, listarFiltrosRelatorio } from "../services/api";

function moeda(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor || 0));
}

function dataBR(data) {
  if (!data) return "-";
  const [ano, mes, dia] = String(data).slice(0, 10).split("-");
  if (!ano || !mes || !dia) return String(data);
  return `${dia}/${mes}/${ano}`;
}

function horaBR(hora) {
  if (!hora) return "-";
  const valor = String(hora).replace("T", " ");
  const data = valor.slice(0, 10);
  const horario = valor.slice(11, 16);
  return `${dataBR(data)} ${horario}`;
}

function numero(valor) {
  return Number(valor || 0).toLocaleString("pt-BR");
}

function maiorValor(lista, campos) {
  return Math.max(1, ...lista.flatMap((item) => campos.map((campo) => Math.abs(Number(item[campo] || 0)))));
}

function resultadoClasse(valor) {
  return Number(valor || 0) >= 0 ? "positivo-text" : "negativo-text";
}

function TooltipTitle({ item, tipo = "produto" }) {
  const nome = item.nome || item.data || item.hora || "Item";
  const label = tipo === "hora" ? horaBR(item.hora) : tipo === "dia" ? dataBR(item.data) : nome;
  return `${label}\nEntradas: ${moeda(item.entradas)}\nSaídas: ${moeda(item.saidas)}\nLucro/Prejuízo: ${moeda(item.lucro)}`;
}

function formatarHoraSQL(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  const hora = String(data.getHours()).padStart(2, "0");
  return `${ano}-${mes}-${dia} ${hora}:00:00`;
}

function preencherHoras(lista) {
  if (!lista.length) return [];
  const ordenada = [...lista].sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
  const inicio = new Date(String(ordenada[0].hora).replace(" ", "T"));
  const fim = new Date(String(ordenada[ordenada.length - 1].hora).replace(" ", "T"));
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return ordenada;

  const mapa = new Map(ordenada.map((item) => [String(item.hora), item]));
  const completa = [];
  for (let atual = new Date(inicio); atual <= fim; atual.setHours(atual.getHours() + 1)) {
    const chave = formatarHoraSQL(atual);
    completa.push(mapa.get(chave) || { hora: chave, entradas: 0, saidas: 0, lucro: 0 });
  }
  return completa;
}

function GraficoColunas({ dados }) {
  const lista = dados.slice(0, 10);
  const max = maiorValor(lista, ["entradas", "saidas", "lucro"]);

  if (!lista.length) return <div className="relatorio-empty">Sem dados para gerar colunas.</div>;

  return (
    <div className="grafico-card">
      <div className="grafico-titulo"><h3>Produtos em colunas</h3><span>Entradas, saídas e lucro por produto</span></div>
      <div className="colunas-chart" role="img" aria-label="Gráfico de colunas por produto">
        {lista.map((item) => {
          const entradaH = Math.max(3, (Number(item.entradas || 0) / max) * 100);
          const saidaH = Math.max(3, (Number(item.saidas || 0) / max) * 100);
          const lucroAbs = Math.abs(Number(item.lucro || 0));
          const lucroH = Math.max(3, (lucroAbs / max) * 100);
          return (
            <div className="coluna-grupo" key={`${item.origem}-${item.produto_id}`} data-tooltip={TooltipTitle({ item })}>
              <div className="coluna-barras">
                <span className="barra-wrap"><em>{moeda(item.entradas)}</em><span className="barra entrada" style={{ height: `${entradaH}%` }}></span></span>
                <span className="barra-wrap"><em>{moeda(item.saidas)}</em><span className="barra saida" style={{ height: `${saidaH}%` }}></span></span>
                <span className="barra-wrap"><em>{moeda(item.lucro)}</em><span className={`barra lucro ${Number(item.lucro) < 0 ? "negativo" : ""}`} style={{ height: `${lucroH}%` }}></span></span>
              </div>
              <small>{item.nome}</small>
            </div>
          );
        })}
      </div>
      <div className="grafico-legenda"><span className="leg entrada">Entradas</span><span className="leg saida">Saídas</span><span className="leg lucro">Lucro/Prejuízo</span></div>
    </div>
  );
}

function GraficoLinha({ dados, modoEvento }) {
  const listaBase = modoEvento ? preencherHoras(dados) : [...dados].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const lista = listaBase.map((item) => ({ ...item, labelLinha: modoEvento ? item.hora : item.data }));
  const largura = 900;
  const altura = 280;
  const pad = 38;
  const max = maiorValor(lista, ["lucro"]);

  if (lista.length < 2) {
    return <div className="relatorio-empty">São necessários pelo menos 2 {modoEvento ? "horários" : "dias"} com dados para gerar linha.</div>;
  }

  const pontos = lista.map((item, index) => {
    const x = pad + (index * (largura - pad * 2)) / Math.max(1, lista.length - 1);
    const y = altura - pad - ((Number(item.lucro || 0) + max) / (max * 2)) * (altura - pad * 2);
    return { ...item, x, y };
  });

  return (
    <div className="grafico-card">
      <div className="grafico-titulo">
        <h3>{modoEvento ? "Lucro por hora do evento" : "Lucro por dia"}</h3>
        <span>{modoEvento ? "Linha gerada entre as horas movimentadas no evento" : "Linha ajuda a ver dias mais fortes e mais fracos"}</span>
      </div>
      <div className="linha-wrap">
        <svg viewBox={`0 0 ${largura} ${altura}`} className="linha-chart" role="img" aria-label="Gráfico de linha do lucro">
          <line x1={pad} y1={altura / 2} x2={largura - pad} y2={altura / 2} className="linha-zero" />
          <polyline points={pontos.map((p) => `${p.x},${p.y}`).join(" ")} className="linha-principal" fill="none" />
          {pontos.map((p, index) => (
            <g className="ponto-linha" key={`${p.labelLinha}-${index}`}>
              <circle cx={p.x} cy={p.y} r="7"><title>{TooltipTitle({ item: p, tipo: modoEvento ? "hora" : "dia" })}</title></circle>
              <text x={p.x} y={altura - 9} textAnchor="middle">{modoEvento ? String(p.hora).slice(11, 16) : dataBR(p.data).slice(0, 5)}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function polarToCartesian(cx, cy, r, angle) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function fatia(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`, "Z"].join(" ");
}

function GraficoPizza({ dados }) {
  const lista = dados.filter((p) => Number(p.lucro || 0) > 0).slice(0, 8);
  const total = lista.reduce((acc, item) => acc + Number(item.lucro || 0), 0);
  let acumulado = 0;

  if (!lista.length || total <= 0) return <div className="relatorio-empty">Sem lucro positivo para gerar pizza.</div>;

  return (
    <div className="grafico-card pizza-grid">
      <div className="grafico-titulo"><h3>Participação no lucro</h3><span>Passe o mouse nas fatias para ver porcentagem e valor</span></div>
      <svg viewBox="0 0 240 240" className="pizza-chart" role="img" aria-label="Gráfico de pizza de lucro por produto">
        {lista.map((item, index) => {
          const porcentagem = Number(item.lucro || 0) / total;
          const inicio = acumulado * 360;
          acumulado += porcentagem;
          const fim = acumulado * 360;
          return (
            <path key={`${item.produto_id}-${index}`} className={`pizza-fatia fatia-${index % 8}`} d={fatia(120, 120, 100, inicio, fim)}>
              <title>{`${item.nome}\n${(porcentagem * 100).toFixed(1)}% do lucro\nLucro: ${moeda(item.lucro)}`}</title>
            </path>
          );
        })}
      </svg>
      <div className="pizza-lista">
        {lista.map((item, index) => {
          const porcentagem = (Number(item.lucro || 0) / total) * 100;
          return (
            <div key={`${item.produto_id}-${index}`} title={`${item.nome} - ${porcentagem.toFixed(1)}% - ${moeda(item.lucro)}`}><span className={`mini-cor fatia-${index % 8}`}></span>{item.nome}<strong>{porcentagem.toFixed(1)}% · {moeda(item.lucro)}</strong></div>
          );
        })}
      </div>
    </div>
  );
}

export default function Relatorios() {
  const hoje = new Date().toISOString().slice(0, 10);
  const primeiroDia = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [filtrosDisponiveis, setFiltrosDisponiveis] = useState({ categorias: [], produtos: [], eventos: [] });
  const [filtros, setFiltros] = useState({ inicio: primeiroDia, fim: hoje, categoria_id: "", produto_id: "", evento_id: "" });
  const [aba, setAba] = useState("numerico");
  const [relatorio, setRelatorio] = useState(null);
  const [feedback, setFeedback] = useState({ tipo: "", mensagem: "" });
  const [carregando, setCarregando] = useState(false);

  async function carregarFiltros() {
    try {
      const resposta = await listarFiltrosRelatorio();
      setFiltrosDisponiveis({ categorias: resposta.categorias || [], produtos: resposta.produtos || [], eventos: resposta.eventos || [] });
    } catch (err) {
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao carregar filtros do relatório." });
    }
  }

  async function gerar(e) {
    e?.preventDefault?.();
    setCarregando(true);
    setFeedback({ tipo: "", mensagem: "" });
    try {
      const resposta = await gerarRelatorioGeral(filtros);
      setRelatorio(resposta);
      setAba("numerico");
    } catch (err) {
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao gerar relatório." });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarFiltros(); }, []);
  useEffect(() => { gerar(); }, []);

  const eventoSelecionado = Boolean(filtros.evento_id);
  const resumo = relatorio?.resumo || { entradas: 0, saidas: 0, lucro: 0 };
  const produtos = relatorio?.produtos || [];
  const categorias = relatorio?.categorias || [];
  const dias = relatorio?.dias || [];
  const horas = relatorio?.horas || [];

  const subtitulo = useMemo(() => {
    if (relatorio?.modo === "evento") return `Evento: ${relatorio?.evento?.nome || "selecionado"}`;
    return `Período: ${dataBR(filtros.inicio)} até ${dataBR(filtros.fim)}`;
  }, [relatorio, filtros.inicio, filtros.fim]);

  return (
    <div className="secao ativa relatorios-page">
      <div className="page-title-row">
        <div><h2>Relatório geral</h2><span>Relatório numérico e visual com filtros por data, categoria, produto e evento.</span></div>
      </div>

      {feedback.mensagem && <div className={`feedback ${feedback.tipo}`}>{feedback.mensagem}</div>}

      <form className="card relatorio-filtros" onSubmit={gerar}>
        <div className="card-header"><h3>Filtros do relatório</h3><span>{eventoSelecionado ? "Evento selecionado: o período fica travado pelo evento." : "Escolha qualquer intervalo entre duas datas."}</span></div>
        <div className="relatorio-form-grid">
          <div className="form-group"><label>Data inicial</label><input type="date" value={filtros.inicio} disabled={eventoSelecionado} onChange={(e) => setFiltros((p) => ({ ...p, inicio: e.target.value }))} /></div>
          <div className="form-group"><label>Data final</label><input type="date" value={filtros.fim} disabled={eventoSelecionado} onChange={(e) => setFiltros((p) => ({ ...p, fim: e.target.value }))} /></div>
          <div className="form-group"><label>Categoria</label><select value={filtros.categoria_id} disabled={eventoSelecionado || filtros.produto_id} onChange={(e) => setFiltros((p) => ({ ...p, categoria_id: e.target.value }))}><option value="">Todas</option>{filtrosDisponiveis.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.tipo})</option>)}</select></div>
          <div className="form-group"><label>Produto</label><select value={filtros.produto_id} onChange={(e) => setFiltros((p) => ({ ...p, produto_id: e.target.value, categoria_id: e.target.value ? "" : p.categoria_id }))}><option value="">Todos</option>{filtrosDisponiveis.produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
          <div className="form-group relatorio-evento-field"><label>Evento</label><select value={filtros.evento_id} onChange={(e) => setFiltros((p) => ({ ...p, evento_id: e.target.value, categoria_id: "" }))}><option value="">Sem evento específico</option>{filtrosDisponiveis.eventos.map((ev) => <option key={ev.id} value={ev.id}>{ev.nome} - {dataBR(ev.data_evento)}</option>)}</select></div>
        </div>
        <div className="form-actions relatorio-actions"><button className="btn-confirmar" disabled={carregando}>{carregando ? "Gerando..." : "Gerar relatório"}</button></div>
      </form>

      <div className="relatorio-tabs" role="tablist" aria-label="Tipos de relatório">
        <button className={aba === "numerico" ? "active" : ""} onClick={() => setAba("numerico")} type="button">Relatório numérico</button>
        <button className={aba === "visual" ? "active" : ""} onClick={() => setAba("visual")} type="button">Relatório visual / gráficos</button>
      </div>

      {!relatorio ? <div className="relatorio-empty">Gere um relatório para visualizar os dados.</div> : (
        <>
          {aba === "numerico" && (
            <div className="relatorio-conteudo">
              <div className="relatorio-subtitulo">{subtitulo}</div>
              <div className="dashboard-grid relatorio-resumo-grid">
                <div className="card dashboard-card-content"><p>Total de entradas</p><strong className="caixa-resumo-valor positivo">{moeda(resumo.entradas)}</strong></div>
                <div className="card dashboard-card-content"><p>Total de saídas</p><strong className="caixa-resumo-valor negativo">{moeda(resumo.saidas)}</strong></div>
                <div className="card dashboard-card-content"><p>{Number(resumo.lucro) >= 0 ? "Lucro" : "Prejuízo"}</p><strong className={`caixa-resumo-valor ${Number(resumo.lucro) >= 0 ? "positivo" : "negativo"}`}>{moeda(resumo.lucro)}</strong></div>
              </div>

              {produtos.length > 0 && (
                <div className="card"><div className="card-header"><h3>Produtos</h3><span>Entradas, saídas e lucro/prejuízo por produto</span></div><div className="table-wrap"><table className="simple-table relatorio-table"><thead><tr><th>Produto</th><th>Origem</th><th>Qtd. entrada</th><th>Qtd. venda</th><th>Entradas brutas</th><th>Saídas brutas</th><th>Lucro/Prejuízo</th></tr></thead><tbody>{produtos.map((p) => <tr key={`${p.origem}-${p.produto_id}`}><td><strong>{p.nome}</strong></td><td>{p.origem}</td><td>{numero(p.qtd_entrada)}</td><td>{numero(p.qtd_saida)}</td><td>{moeda(p.entradas)}</td><td>{moeda(p.saidas)}</td><td className={resultadoClasse(p.lucro)}><strong>{moeda(p.lucro)}</strong></td></tr>)}</tbody></table></div></div>
              )}

              {!filtros.produto_id && categorias.length > 0 && (
                <div className="card"><div className="card-header"><h3>Categorias</h3><span>Movimentações comuns agrupadas por categoria</span></div><div className="table-wrap"><table className="simple-table"><thead><tr><th>Categoria</th><th>Entradas</th><th>Saídas</th><th>Resultado</th></tr></thead><tbody>{categorias.map((c) => <tr key={c.categoria_id}><td>{c.nome}</td><td>{moeda(c.entradas)}</td><td>{moeda(c.saidas)}</td><td className={resultadoClasse(c.lucro)}><strong>{moeda(c.lucro)}</strong></td></tr>)}</tbody></table></div></div>
              )}

              {produtos.length === 0 && categorias.length === 0 && <div className="relatorio-empty">Nenhum dado encontrado para os filtros escolhidos.</div>}
            </div>
          )}

          {aba === "visual" && (
            <div className="relatorio-visual-grid">
              <div className="relatorio-subtitulo">{subtitulo}</div>
              <GraficoLinha dados={relatorio?.modo === "evento" ? horas : dias} modoEvento={relatorio?.modo === "evento"} />
              <GraficoPizza dados={produtos} />
              <GraficoColunas dados={produtos} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
