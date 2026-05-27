import { useEffect, useMemo, useState } from "react";
import { adicionarMembroClube, listarCargos, listarMembrosClube } from "../services/api";

const estadoInicial = {
  nome: "",
  sobrenome: "",
  email: "",
  cargo_id: "",
};

export default function UsuariosClube() {
  const [form, setForm] = useState(estadoInicial);
  const [membros, setMembros] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [senhaTemporaria, setSenhaTemporaria] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function carregarDados() {
    try {
      setErro("");
      const [membrosResp, cargosResp] = await Promise.all([
        listarMembrosClube(),
        listarCargos(),
      ]);

      setMembros(Array.isArray(membrosResp.membros) ? membrosResp.membros : []);
      setCargos(Array.isArray(cargosResp.cargos) ? cargosResp.cargos : []);
    } catch (err) {
      setErro(err?.message || "Erro ao carregar dados.");
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((atual) => ({
      ...atual,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setCarregando(true);
    setErro("");
    setMensagem("");
    setSenhaTemporaria("");

    try {
      const resposta = await adicionarMembroClube({
        nome: form.nome.trim(),
        sobrenome: form.sobrenome.trim(),
        email: form.email.trim(),
        cargo_id: form.cargo_id || null,
      });

      if (resposta.erro) {
        throw new Error(resposta.erro);
      }

      setMensagem(resposta.mensagem || "Usuário adicionado ao clube.");
      setSenhaTemporaria(resposta.senha_temporaria || "");
      setForm(estadoInicial);
      await carregarDados();
    } catch (err) {
      setErro(err?.message || "Erro ao adicionar usuário.");
    } finally {
      setCarregando(false);
    }
  }

  const membrosOrdenados = useMemo(() => {
    return [...membros].sort((a, b) => {
      const nomeA = `${a.nome} ${a.sobrenome}`.toLowerCase();
      const nomeB = `${b.nome} ${b.sobrenome}`.toLowerCase();
      return nomeA.localeCompare(nomeB);
    });
  }, [membros]);

  return (
    <section className="secao ativa">
      <div className="card">
        <div className="card-header">
          <h3>Adicionar usuário ao clube</h3>
        </div>

        <form onSubmit={handleSubmit} className="form-movimentacao">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="nome">Nome</label>
              <input
                id="nome"
                name="nome"
                type="text"
                value={form.nome}
                onChange={handleChange}
                placeholder="Nome"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="sobrenome">Sobrenome</label>
              <input
                id="sobrenome"
                name="sobrenome"
                type="text"
                value={form.sobrenome}
                onChange={handleChange}
                placeholder="Sobrenome"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="email@exemplo.com"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="cargo_id">Cargo <span className="opcional">(opcional)</span></label>
              <select
                id="cargo_id"
                name="cargo_id"
                value={form.cargo_id}
                onChange={handleChange}
              >
                <option value="">Sem cargo definido</option>
                {cargos.map((cargo) => (
                  <option key={cargo.id} value={cargo.id}>
                    {cargo.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-confirmar" disabled={carregando}>
              {carregando ? "Salvando..." : "Adicionar usuário"}
            </button>
          </div>

          {mensagem ? <div className="feedback sucesso">{mensagem}</div> : null}
          {erro ? <div className="feedback erro">{erro}</div> : null}
          {senhaTemporaria ? (
            <div className="feedback aviso">
              <strong>Senha temporária gerada:</strong> {senhaTemporaria}
            </div>
          ) : null}
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Membros do clube</h3>
        </div>

        <div className="listagem-card">
          {membrosOrdenados.length === 0 ? (
            <p className="empty-state">Nenhum usuário vinculado a este clube.</p>
          ) : (
            <div className="simple-table-wrapper">
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Cargo</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {membrosOrdenados.map((membro) => (
                    <tr key={membro.id}>
                      <td>{membro.nome} {membro.sobrenome}</td>
                      <td>{membro.email}</td>
                      <td>{membro.cargo_nome || "Sem cargo"}</td>
                      <td>
                        <span className={`status-chip ${membro.status}`}>
                          {membro.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
