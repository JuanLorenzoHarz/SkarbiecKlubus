import { useEffect, useMemo, useState } from "react";
import { listarHistorico } from "../services/api";

const entidades = [
  { valor: "", label: "Todas as áreas" },
  { valor: "movimentacao", label: "Movimentações" },
  { valor: "produto", label: "Produtos" },
  { valor: "categoria", label: "Categorias" },
  { valor: "cargo", label: "Cargos" },
  { valor: "usuario_clube", label: "Usuários do clube" },
  { valor: "mensalidade", label: "Mensalidades" },
];

const acoes = [
  { valor: "", label: "Todas as ações" },
  { valor: "criar", label: "Criação" },
  { valor: "editar", label: "Edição" },
  { valor: "movimentar", label: "Movimentação" },
  { valor: "pagar", label: "Pagamento" },
  { valor: "vincular", label: "Vínculo" },
];

function formatarData(data) {
  if (!data) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(String(data).replace(" ", "T")));
}

function rotuloEntidade(valor) {
  return entidades.find((item) => item.valor === valor)?.label || valor;
}

function rotuloAcao(valor) {
  return acoes.find((item) => item.valor === valor)?.label || valor;
}

export default function Historico() {
  const [historico, setHistorico] = useState([]);
  const [filtros, setFiltros] = useState({ entidade: "", acao: "", busca: "" });
  const [carregando, setCarregando] = useState(true);
  const [feedback, setFeedback] = useState({ tipo: "", mensagem: "" });

  const totalRegistros = useMemo(() => historico.length, [historico]);

  function alterarFiltro(e) {
    const { id, value } = e.target;
    setFiltros((prev) => ({ ...prev, [id]: value }));
  }

  async function carregarHistorico() {
    setCarregando(true);
    setFeedback({ tipo: "", mensagem: "" });

    try {
      const data = await listarHistorico({ ...filtros, limite: 150 });
      setHistorico(data.historico || []);
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: error.message || "Erro ao carregar histórico." });
    } finally {
      setCarregando(false);
    }
  }

  function limparFiltros() {
    setFiltros({ entidade: "", acao: "", busca: "" });
  }

  useEffect(() => {
    carregarHistorico();
  }, []);

  return (
    <div className="secao ativa">
      <div>
        <h2>Histórico</h2>
        <span>Registro de logs das ações realizadas no clube atual</span>
      </div>

      <div className="card caixa-resumo-card compact">
        <div className="dashboard-card-content historico-resumo">
          <p>Total carregado</p>
          <strong className="caixa-resumo-valor">{totalRegistros}</strong>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Filtros</h3>
        </div>

        <div className="form-movimentacao">
          {feedback.mensagem && <div className={`feedback ${feedback.tipo}`}>{feedback.mensagem}</div>}

          <div className="form-row historico-filtros">
            <div className="form-group">
              <label htmlFor="entidade">Área</label>
              <select id="entidade" value={filtros.entidade} onChange={alterarFiltro}>
                {entidades.map((item) => (
                  <option key={item.valor} value={item.valor}>{item.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="acao">Ação</label>
              <select id="acao" value={filtros.acao} onChange={alterarFiltro}>
                {acoes.map((item) => (
                  <option key={item.valor} value={item.valor}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="busca">Buscar</label>
            <input
              id="busca"
              value={filtros.busca}
              onChange={alterarFiltro}
              placeholder="Pesquise por descrição, usuário, ação ou área"
            />
          </div>

          <div className="form-actions">
            <button className="btn-cancelar" type="button" onClick={limparFiltros}>Limpar</button>
            <button className="btn-confirmar" type="button" onClick={carregarHistorico}>Filtrar histórico</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Registros</h3>
        </div>

        <div className="table-wrap">
          {carregando ? (
            <p style={{ padding: "1rem" }}>Carregando histórico...</p>
          ) : historico.length === 0 ? (
            <p style={{ padding: "1rem" }}>Nenhum registro encontrado.</p>
          ) : (
            <table className="simple-table historico-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Área</th>
                  <th>Descrição</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((item) => (
                  <tr key={item.id}>
                    <td>{formatarData(item.criado_em)}</td>
                    <td>
                      <strong>{item.usuario_nome?.trim() || "Usuário"}</strong>
                      {item.usuario_email && <small>{item.usuario_email}</small>}
                    </td>
                    <td><span className="log-badge">{rotuloAcao(item.acao)}</span></td>
                    <td>{rotuloEntidade(item.entidade)}</td>
                    <td>{item.descricao}</td>
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
