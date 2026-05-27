import { useEffect, useMemo, useState } from "react";
import { buscarClubesEvento, criarEvento, listarEventos } from "../services/api";

function formatarData(data) {
  if (!data) return "-";
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

export default function Eventos({ onOpenManage, onOpenReport }) {
  const [form, setForm] = useState({ nome: "", data_evento: "" });
  const [busca, setBusca] = useState("");
  const [sugestoes, setSugestoes] = useState([]);
  const [clubesSelecionados, setClubesSelecionados] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [feedback, setFeedback] = useState({ tipo: "", mensagem: "" });
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const selecionadosIds = useMemo(() => new Set(clubesSelecionados.map((c) => Number(c.id))), [clubesSelecionados]);

  async function carregarEventos() {
    try {
      const data = await listarEventos();
      setEventos(data.eventos || []);
    } catch (err) {
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao carregar eventos." });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarEventos(); }, []);

  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) {
      setSugestoes([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const data = await buscarClubesEvento(termo);
        setSugestoes((data.clubes || []).filter((c) => !selecionadosIds.has(Number(c.id))));
      } catch {
        setSugestoes([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [busca, selecionadosIds]);

  function adicionarClube(clube) {
    setClubesSelecionados((prev) => [...prev, clube]);
    setBusca("");
    setSugestoes([]);
  }

  function removerClube(id) {
    setClubesSelecionados((prev) => prev.filter((c) => Number(c.id) !== Number(id)));
  }

  async function salvarEvento() {
    if (!form.nome.trim() || !form.data_evento) {
      setFeedback({ tipo: "erro", mensagem: "Preencha o nome e a data do evento." });
      return;
    }

    setEnviando(true);
    try {
      await criarEvento({
        nome: form.nome.trim(),
        data_evento: form.data_evento,
        clubes_parceiros: clubesSelecionados.map((c) => Number(c.id)),
      });
      setFeedback({ tipo: "sucesso", mensagem: "Evento criado e disponibilizado para os clubes parceiros." });
      setForm({ nome: "", data_evento: "" });
      setClubesSelecionados([]);
      await carregarEventos();
    } catch (err) {
      setFeedback({ tipo: "erro", mensagem: err.message || "Erro ao criar evento." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="secao ativa">
      <div>
        <h2>Eventos</h2>
        <span>Criação, parceria entre clubes e acesso ao gerenciamento ou relatório.</span>
      </div>

      <div className="card">
        <div className="card-header"><h3>Novo evento</h3></div>
        <div className="form-movimentacao">
          {feedback.mensagem && <div className={`feedback ${feedback.tipo}`}>{feedback.mensagem}</div>}

          <div className="form-row">
            <div className="form-group">
              <label>Nome do evento</label>
              <input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Data do evento</label>
              <input type="date" value={form.data_evento} onChange={(e) => setForm((p) => ({ ...p, data_evento: e.target.value }))} />
            </div>
          </div>

          <div className="form-group autocomplete-wrap">
            <label>Clubes parceiros por nome ou código</label>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite parte do nome ou código..." />
            {sugestoes.length > 0 && (
              <div className="autocomplete-list">
                {sugestoes.map((clube) => (
                  <button key={clube.id} type="button" onClick={() => adicionarClube(clube)}>
                    <strong>{clube.nome}</strong><span>{clube.codigo} • {clube.cidade}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="tag-list">
            {clubesSelecionados.length === 0 ? <span className="tag tag-muted">Nenhum clube parceiro selecionado</span> : clubesSelecionados.map((c) => (
              <span className="tag" key={c.id}>{c.nome} ({c.codigo}) <button className="tag-remove" onClick={() => removerClube(c.id)}>×</button></span>
            ))}
          </div>

          <div className="form-actions">
            <button className="btn-cancelar" type="button" onClick={() => { setForm({ nome: "", data_evento: "" }); setClubesSelecionados([]); }}>Limpar</button>
            <button className="btn-confirmar" type="button" onClick={salvarEvento} disabled={enviando}>{enviando ? "Criando..." : "Criar evento"}</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Lista de eventos</h3></div>
        <div className="table-wrap">
          {carregando ? <p style={{ padding: "1rem" }}>Carregando eventos...</p> : eventos.length === 0 ? <p style={{ padding: "1rem" }}>Nenhum evento encontrado.</p> : (
            <table className="simple-table">
              <thead><tr><th>Evento</th><th>Data</th><th>Clubes</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {eventos.map((e) => (
                  <tr key={e.id}>
                    <td>{e.nome}</td>
                    <td>{formatarData(e.data_evento)}</td>
                    <td>{e.clubes || "-"}</td>
                    <td>{Number(e.ativo) === 1 ? "Ativo" : "Fechado"}</td>
                    <td>
                      <div className="estoque-acoes">
                        <button className="btn-confirmar" onClick={() => onOpenManage(Number(e.id))} disabled={Number(e.ativo) !== 1}>Gerenciar</button>
                        <button className="btn-cancelar" onClick={() => onOpenReport(Number(e.id))}>Relatório</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
