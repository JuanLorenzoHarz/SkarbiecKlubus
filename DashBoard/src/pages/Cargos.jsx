import { useEffect, useState } from "react";
import { criarCargo, listarCargos } from "../services/api";

const PERMISSOES = [
  { chave: "perm_aprovar_membros", label: "Aprovar membros" },
  { chave: "perm_gerenciar_cargos", label: "Gerenciar cargos" },
  { chave: "perm_ver_movimentacoes", label: "Ver movimentações" },
  { chave: "perm_editar_movimentacoes", label: "Editar movimentações" },
  { chave: "perm_ver_relatorios", label: "Ver relatórios" },
  { chave: "perm_exportar_relatorios", label: "Exportar relatórios" },
  { chave: "perm_ver_mensalidades", label: "Ver mensalidades" },
  { chave: "perm_editar_mensalidades", label: "Editar mensalidades" },
  { chave: "perm_ver_gastos_fixos", label: "Ver gastos fixos" },
  { chave: "perm_editar_gastos_fixos", label: "Editar gastos fixos" },
  { chave: "perm_ver_produtos", label: "Ver produtos" },
  { chave: "perm_editar_produtos", label: "Editar produtos" },
  { chave: "perm_ver_eventos", label: "Ver eventos" },
  { chave: "perm_editar_eventos", label: "Editar eventos" },
];

const initialForm = PERMISSOES.reduce(
  (acc, permissao) => ({ ...acc, [permissao.chave]: false }),
  { nome: "" }
);

export default function Cargos() {
  const [form, setForm] = useState(initialForm);
  const [cargos, setCargos] = useState([]);
  const [feedback, setFeedback] = useState({ tipo: "", mensagem: "" });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  async function carregarCargos() {
    setCarregando(true);

    try {
      const resposta = await listarCargos();

      if (resposta.erro) {
        setFeedback({ tipo: "erro", mensagem: resposta.erro });
        return;
      }

      setCargos(Array.isArray(resposta.cargos) ? resposta.cargos : []);
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: "Erro ao carregar cargos." });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarCargos();
  }, []);

  function handleChange(e) {
    const { id, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [id]: type === "checkbox" ? checked : value,
    }));
  }

  function limparFormulario() {
    setForm(initialForm);
    setFeedback({ tipo: "", mensagem: "" });
  }

  async function handleSubmit() {
    const nome = form.nome.trim();

    if (!nome) {
      setFeedback({ tipo: "erro", mensagem: "⚠ Digite o nome do cargo." });
      return;
    }

    setSalvando(true);

    try {
      const resposta = await criarCargo({ ...form, nome });

      if (resposta.erro) {
        setFeedback({ tipo: "erro", mensagem: resposta.erro });
        return;
      }

      setFeedback({ tipo: "sucesso", mensagem: "✔ Cargo criado com sucesso!" });
      setForm(initialForm);
      await carregarCargos();
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: "Erro ao conectar com o servidor." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="secao ativa">
      <div>
        <h2>Cargos</h2>
        <span>Cadastre cargos e configure permissões do clube</span>
      </div>

      <div className="content-grid two-columns">
        <div className="card">
          <div className="card-header">
            <h3>Novo Cargo</h3>
          </div>

          <div className="form-movimentacao">
            {feedback.mensagem && <div className={`feedback ${feedback.tipo}`}>{feedback.mensagem}</div>}

            <div className="form-group">
              <label htmlFor="nome">Nome do cargo</label>
              <input
                id="nome"
                type="text"
                placeholder="Ex: Tesoureiro auxiliar"
                value={form.nome}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>Permissões</label>
              <div className="permissions-grid">
                {PERMISSOES.map((permissao) => (
                  <label key={permissao.chave} className="permission-item" htmlFor={permissao.chave}>
                    <input
                      id={permissao.chave}
                      type="checkbox"
                      checked={form[permissao.chave]}
                      onChange={handleChange}
                    />
                    <span>{permissao.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <button className="btn-cancelar" type="button" onClick={limparFormulario}>
                Limpar
              </button>
              <button className="btn-confirmar" type="button" onClick={handleSubmit} disabled={salvando}>
                {salvando ? "Salvando..." : "Criar cargo"}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Cargos cadastrados</h3>
          </div>

          <div className="listagem-card cargo-lista">
            {carregando ? (
              <p className="empty-state">Carregando cargos...</p>
            ) : cargos.length === 0 ? (
              <p className="empty-state">Nenhum cargo cadastrado para este clube.</p>
            ) : (
              cargos.map((cargo) => (
                <div key={cargo.id} className="list-item">
                  <div className="list-item-header">
                    <strong>{cargo.nome}</strong>
                    <span>{cargo.total_permissoes} permissões</span>
                  </div>

                  <div className="tag-list">
                    {cargo.permissoes_ativas.length > 0 ? (
                      cargo.permissoes_ativas.map((permissao) => (
                        <span key={permissao} className="tag">
                          {permissao}
                        </span>
                      ))
                    ) : (
                      <span className="tag tag-muted">Sem permissões ativas</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
