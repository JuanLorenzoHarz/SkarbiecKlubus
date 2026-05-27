import { useEffect, useState } from "react";
import { criarCategoria, listarCategorias } from "../services/api";

const initialForm = {
  nome: "",
  tipo: "receita",
};

export default function Categorias() {
  const [form, setForm] = useState(initialForm);
  const [categorias, setCategorias] = useState([]);
  const [feedback, setFeedback] = useState({ tipo: "", mensagem: "" });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  async function carregarCategorias() {
    setCarregando(true);

    try {
      const resposta = await listarCategorias();

      if (resposta.erro) {
        setFeedback({ tipo: "erro", mensagem: resposta.erro });
        return;
      }

      setCategorias(Array.isArray(resposta.categorias) ? resposta.categorias : []);
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: "Erro ao carregar categorias." });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarCategorias();
  }, []);

  function handleChange(e) {
    const { id, value } = e.target;
    setForm((prev) => ({ ...prev, [id]: value }));
  }

  function limparFormulario() {
    setForm(initialForm);
    setFeedback({ tipo: "", mensagem: "" });
  }

  async function handleSubmit() {
    const nome = form.nome.trim();

    if (!nome || !form.tipo) {
      setFeedback({ tipo: "erro", mensagem: "⚠ Preencha nome e tipo da categoria." });
      return;
    }

    setSalvando(true);

    try {
      const resposta = await criarCategoria({ nome, tipo: form.tipo });

      if (resposta.erro) {
        setFeedback({ tipo: "erro", mensagem: resposta.erro });
        return;
      }

      setFeedback({ tipo: "sucesso", mensagem: "✔ Categoria criada com sucesso!" });
      setForm(initialForm);
      await carregarCategorias();
    } catch (error) {
      setFeedback({ tipo: "erro", mensagem: "Erro ao conectar com o servidor." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="secao ativa">
      <div>
        <h2>Categorias</h2>
        <span>Gerencie categorias de receita e despesa</span>
      </div>

      <div className="content-grid two-columns">
        <div className="card">
          <div className="card-header">
            <h3>Nova Categoria</h3>
          </div>

          <div className="form-movimentacao">
            {feedback.mensagem && <div className={`feedback ${feedback.tipo}`}>{feedback.mensagem}</div>}

            <div className="form-group">
              <label htmlFor="nome">Nome</label>
              <input
                id="nome"
                type="text"
                placeholder="Ex: Mensalidade, Patrocínio, Transporte"
                value={form.nome}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="tipo">Tipo</label>
              <select id="tipo" value={form.tipo} onChange={handleChange}>
                <option value="receita">Receita</option>
                <option value="despesa">Despesa</option>
              </select>
            </div>

            <div className="form-actions">
              <button className="btn-cancelar" type="button" onClick={limparFormulario}>
                Limpar
              </button>
              <button className="btn-confirmar" type="button" onClick={handleSubmit} disabled={salvando}>
                {salvando ? "Salvando..." : "Criar categoria"}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Categorias cadastradas</h3>
          </div>

          <div className="listagem-card">
            {carregando ? (
              <p className="empty-state">Carregando categorias...</p>
            ) : categorias.length === 0 ? (
              <p className="empty-state">Nenhuma categoria cadastrada para este clube.</p>
            ) : (
              <div className="simple-table-wrapper">
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categorias.map((categoria) => (
                      <tr key={categoria.id}>
                        <td>{categoria.nome}</td>
                        <td>
                          <span className={`badge ${categoria.tipo}`}>{categoria.tipo}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
