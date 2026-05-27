import { useEffect, useMemo, useState } from "react";
import { detalharEvento, enviarRepasseEvento, relatorioEvento, verificarAlertaEvento } from "../services/api";

function moeda(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
}

export default function EventoRelatorio({ eventoId, onBack }) {
  const [relatorio, setRelatorio] = useState(null);
  const [clubes, setClubes] = useState([]);
  const [repasse, setRepasse] = useState({ clube_destino_id: "", tipoCalculo: "valor", valor: "", porcentagem: "", base: "lucro" });
  const [feedback, setFeedback] = useState({ tipo: "", mensagem: "" });
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    try {
      const [r, d] = await Promise.all([relatorioEvento(eventoId), detalharEvento(eventoId)]);
      setRelatorio(r);
      setClubes(d.clubes || []);
    } catch (err) {
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao carregar relatório." });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [eventoId]);

  const meuLucro = useMemo(() => (relatorio?.meus_produtos || []).reduce((acc, p) => acc + Number(p.lucro || 0), 0), [relatorio]);
  const minhaReceita = useMemo(() => (relatorio?.meus_produtos || []).reduce((acc, p) => acc + Number(p.receita || 0), 0), [relatorio]);

  const valorCalculado = useMemo(() => {
    if (repasse.tipoCalculo === "valor") return Number(repasse.valor || 0);
    const base = repasse.base === "receita" ? minhaReceita : meuLucro;
    return base * (Number(repasse.porcentagem || 0) / 100);
  }, [repasse, meuLucro, minhaReceita]);

  async function enviarRepasse() {
    if (!repasse.clube_destino_id || valorCalculado <= 0) {
      setFeedback({ tipo: "erro", mensagem: "Selecione o clube e informe um valor ou porcentagem válida." });
      return;
    }
    try {
      await enviarRepasseEvento({
        evento_id: eventoId,
        clube_destino_id: Number(repasse.clube_destino_id),
        valor: valorCalculado,
        porcentagem: repasse.tipoCalculo === "porcentagem" ? Number(repasse.porcentagem || 0) : null,
        mensagem: `Repasse sugerido de ${moeda(valorCalculado)} referente ao evento.`,
      });
      setFeedback({ tipo: "sucesso", mensagem: "Alerta de repasse enviado para o outro clube verificar." });
      await carregar();
    } catch (err) {
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao enviar repasse." });
    }
  }

  async function verificar(alertaId) {
    try {
      await verificarAlertaEvento(alertaId);
      setFeedback({ tipo: "sucesso", mensagem: "Alerta marcado como verificado." });
      await carregar();
    } catch (err) {
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao verificar alerta." });
    }
  }

  if (carregando) return <div className="secao ativa"><p>Carregando relatório...</p></div>;
  const outrosClubes = clubes.filter((c) => String(c.id) !== String(relatorio?.evento?.clube_id));

  return (
    <div className="secao ativa">
      <div className="page-title-row">
        <div><h2>Relatório do evento</h2><span>{relatorio?.evento?.nome}</span></div>
        <button className="btn-cancelar" onClick={onBack}>Voltar</button>
      </div>
      {feedback.mensagem && <div className={`feedback ${feedback.tipo}`}>{feedback.mensagem}</div>}

      <div className="dashboard-grid">
        <div className="card dashboard-card-content"><p>Receita do meu clube</p><strong className="caixa-resumo-valor">{moeda(minhaReceita)}</strong></div>
        <div className="card dashboard-card-content"><p>Lucro estimado do meu clube</p><strong className="caixa-resumo-valor">{moeda(meuLucro)}</strong></div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Relatório dos meus produtos</h3></div>
        <div className="table-wrap">
          <table className="simple-table"><thead><tr><th>Produto</th><th>Origem</th><th>Vendidos</th><th>Receita</th><th>Lucro estimado</th></tr></thead><tbody>
            {(relatorio?.meus_produtos || []).map((p) => <tr key={`${p.origem}-${p.produto_id}`}><td>{p.nome}</td><td>{p.origem}</td><td>{p.vendidos}</td><td>{moeda(p.receita)}</td><td>{moeda(p.lucro)}</td></tr>)}
          </tbody></table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Relatório geral do evento</h3></div>
        <div className="table-wrap">
          <table className="simple-table"><thead><tr><th>Clube</th><th>Receita</th><th>Compras</th><th>Lucro estimado</th></tr></thead><tbody>
            {(relatorio?.relatorio_geral || []).map((c) => <tr key={c.clube_id}><td>{c.clube_nome}</td><td>{moeda(c.receita)}</td><td>{moeda(c.compras)}</td><td>{moeda(c.lucro)}</td></tr>)}
          </tbody></table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Calcular e enviar repasse para outro clube</h3></div>
        <div className="form-movimentacao">
          <div className="form-row">
            <div className="form-group"><label>Clube destino</label><select value={repasse.clube_destino_id} onChange={(e) => setRepasse((p) => ({ ...p, clube_destino_id: e.target.value }))}><option value="">Selecione</option>{clubes.map((c) => <option key={c.id} value={c.id}>{c.nome} - {c.codigo}</option>)}</select></div>
            <div className="form-group"><label>Tipo de cálculo</label><select value={repasse.tipoCalculo} onChange={(e) => setRepasse((p) => ({ ...p, tipoCalculo: e.target.value }))}><option value="valor">Valor fixo</option><option value="porcentagem">Porcentagem</option></select></div>
          </div>
          {repasse.tipoCalculo === "valor" ? <div className="form-group"><label>Valor</label><input type="number" value={repasse.valor} onChange={(e) => setRepasse((p) => ({ ...p, valor: e.target.value }))} /></div> : <div className="form-row"><div className="form-group"><label>Porcentagem</label><input type="number" value={repasse.porcentagem} onChange={(e) => setRepasse((p) => ({ ...p, porcentagem: e.target.value }))} /></div><div className="form-group"><label>Base</label><select value={repasse.base} onChange={(e) => setRepasse((p) => ({ ...p, base: e.target.value }))}><option value="lucro">Lucro</option><option value="receita">Receita</option></select></div></div>}
          <div>Valor calculado para enviar como alerta: <strong>{moeda(valorCalculado)}</strong></div>
          <div className="form-actions"><button className="btn-confirmar" onClick={enviarRepasse}>Enviar alerta de repasse</button></div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Alertas</h3></div>
        <div className="table-wrap">
          {(relatorio?.alertas || []).length === 0 ? <p style={{ padding: "1rem" }}>Nenhum alerta.</p> : <table className="simple-table"><thead><tr><th>Origem</th><th>Destino</th><th>Valor</th><th>Status</th><th>Ação</th></tr></thead><tbody>
            {relatorio.alertas.map((a) => <tr key={a.id}><td>{a.clube_origem}</td><td>{a.clube_destino}</td><td>{moeda(a.valor)}</td><td>{Number(a.verificado) === 1 ? "Verificado" : "Pendente"}</td><td>{Number(a.verificado) === 1 ? "-" : <button className="btn-confirmar" onClick={() => verificar(a.id)}>Confirmar verificação</button>}</td></tr>)}
          </tbody></table>}
        </div>
      </div>
    </div>
  );
}
