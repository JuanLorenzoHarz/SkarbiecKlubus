// @ts-nocheck
import { useEffect, useRef, useState, useCallback } from "react";
import { get, post } from "../services/api";

const POLL_MS = 4000;

function iniciais(nome = "") {
  const p = nome.trim().split(/\s+/);
  return (p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "");
}

function formatarHora(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString())
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatarDataSep(dtStr) {
  if (!dtStr) return "";
  const d = new Date(dtStr + "T00:00:00");
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  if (d.getTime() === hoje.getTime()) return "Hoje";
  if (d.getTime() === ontem.getTime()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

// ── Avatar ─────────────────────────────────────────────────────────────────
function Avatar({ nome, size = 36 }) {
  const ini = iniciais(nome).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "linear-gradient(135deg,#554824,#c9a84c)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'EB Garamond',serif", fontSize: size * 0.38,
      color: "#f0e6d0", flexShrink: 0,
    }}>
      {ini}
    </div>
  );
}

// ── Modal: Nova Conversa ───────────────────────────────────────────────────
function ModalNovaConversa({ onIniciar, onFechar }) {
  const [q, setQ] = useState("");
  const [membros, setMembros] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const timer = useRef(null);

  function handleInput(v) {
    setQ(v);
    clearTimeout(timer.current);
    if (!v.trim()) { setMembros([]); return; }
    setBuscando(true);
    timer.current = setTimeout(async () => {
      try {
        const d = await get(`chat.php?acao=buscar_membros&q=${encodeURIComponent(v)}`);
        setMembros(d.membros || []);
      } catch { setErro("Erro na busca."); }
      finally { setBuscando(false); }
    }, 350);
  }

  async function selecionar(id) {
    setErro("");
    try {
      const d = await post("chat.php", { acao: "nova_conversa", destinatario_id: id });
      if (d.erro) { setErro(d.erro); return; }
      onIniciar(d.conversa_id);
    } catch (e) { setErro(e.message || "Erro ao iniciar conversa."); }
  }

  return (
    <div
      onClick={onFechar}
      style={{
        position: "fixed", inset: 0, background: "rgba(43,30,15,.45)",
        zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#faf6ef", border: "1px solid #d4c9b0", borderRadius: 8,
          boxShadow: "4px 4px 0 #d4c9b0", padding: "28px 24px",
          width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div>
          <h3 style={{ fontFamily: "'EB Garamond',serif", fontSize: 22, color: "#2b1e0f" }}>
            Nova Conversa
          </h3>
          <p style={{ fontSize: 13, color: "#9a8470", marginTop: 4 }}>
            Busque por nome, e-mail ou clube.
          </p>
        </div>

        {erro && (
          <div style={{
            padding: "10px 14px", borderRadius: 4, background: "#fdecea",
            color: "#a0291f", border: "1px solid #f0b8b4", fontSize: 13,
          }}>
            {erro}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={{ fontSize: 11, color: "#7a5c2e", textTransform: "uppercase", letterSpacing: 1 }}>
            Buscar membro
          </label>
          <input
            autoFocus
            value={q}
            onChange={e => handleInput(e.target.value)}
            placeholder="Ex.: João, clube ABC, joao@mail.com"
            style={{
              padding: "11px 14px", border: "1px solid #d4c9b0", borderRadius: 4,
              background: "#f2ede4", fontSize: 14, color: "#2b1e0f",
              fontFamily: "'Lato',sans-serif", outline: "none",
            }}
          />
        </div>

        <div style={{
          border: "1px solid #d4c9b0", borderRadius: 4, background: "#f2ede4",
          maxHeight: 240, overflowY: "auto",
        }}>
          {buscando && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "#9a8470" }}>
              Buscando…
            </div>
          )}
          {!buscando && !q.trim() && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "#9a8470" }}>
              Digite para pesquisar…
            </div>
          )}
          {!buscando && q.trim() && membros.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "#9a8470" }}>
              Nenhum membro encontrado.
            </div>
          )}
          {membros.map(m => (
            <div
              key={m.id}
              onClick={() => selecionar(m.id)}
              style={{
                padding: "12px 14px", borderBottom: "1px solid #d4c9b0",
                cursor: "pointer", display: "flex", gap: 10, alignItems: "center",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#f4ede0"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Avatar nome={m.nome_completo} size={34} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#2b1e0f" }}>{m.nome_completo}</div>
                <div style={{ fontSize: 11, color: "#9a8470" }}>{m.clube_nome} · {m.clube_codigo}</div>
                <div style={{ fontSize: 11, color: "#7a5c2e" }}>{m.email}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-cancelar" onClick={onFechar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────
export default function Chat() {
  const [conversas, setConversas] = useState([]);
  const [ativa, setAtiva] = useState(null);       // objeto conversa
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modal, setModal] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erroGlobal, setErroGlobal] = useState("");
  const msgEndRef = useRef(null);
  const pollRef = useRef(null);

  // ── Carregar conversas ─────────────────────────────────────────────
  const carregarConversas = useCallback(async () => {
    try {
      const d = await get("chat.php?acao=conversas");
      setConversas(d.conversas || []);
    } catch (e) {
      setErroGlobal(e.message || "Erro ao carregar conversas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  // ── Carregar mensagens ─────────────────────────────────────────────
  const carregarMensagens = useCallback(async (id) => {
    try {
      const d = await get(`chat.php?acao=mensagens&conversa_id=${id}`);
      setMensagens(d.mensagens || []);
    } catch {}
  }, []);

  // ── Polling ────────────────────────────────────────────────────────
  useEffect(() => {
    carregarConversas();
    pollRef.current = setInterval(async () => {
      await carregarConversas();
      if (ativa) await carregarMensagens(ativa.id);
    }, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [carregarConversas]);                        // intencionalmente sem `ativa`

  // Scroll automático ao fim
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  // ── Selecionar conversa ────────────────────────────────────────────
  async function selecionarConversa(conv) {
    setAtiva(conv);
    await carregarMensagens(conv.id);
    // Marcar lidas
    try { await post("chat.php", { acao: "marcar_lidas", conversa_id: conv.id }); }
    catch {}
    await carregarConversas();
  }

  // ── Enviar mensagem ────────────────────────────────────────────────
  async function enviar() {
    if (!ativa || !texto.trim() || enviando) return;
    setEnviando(true);
    try {
      await post("chat.php", { acao: "enviar", conversa_id: ativa.id, conteudo: texto.trim() });
      setTexto("");
      await carregarMensagens(ativa.id);
      await carregarConversas();
    } catch (e) {
      alert(e.message || "Erro ao enviar.");
    } finally {
      setEnviando(false);
    }
  }

  function teclaEnviar(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
  }

  // ── Iniciar conversa via modal ─────────────────────────────────────
  async function handleIniciar(convId) {
    setModal(false);
    await carregarConversas();
    // Seleciona a conversa recém-criada
    const d = await get("chat.php?acao=conversas");
    const todas = d.conversas || [];
    setConversas(todas);
    const encontrada = todas.find(c => String(c.id) === String(convId));
    if (encontrada) selecionarConversa(encontrada);
  }

  // ── Lista filtrada ─────────────────────────────────────────────────
  const listaFiltrada = conversas.filter(c =>
    !filtro.trim() ||
    c.outro_nome?.toLowerCase().includes(filtro.toLowerCase()) ||
    c.outro_clube_nome?.toLowerCase().includes(filtro.toLowerCase())
  );

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="secao ativa" style={{ padding: 0, gap: 0, overflow: "hidden", flexDirection: "row" }}>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside style={{
        width: 280, flexShrink: 0, display: "flex", flexDirection: "column",
        borderRight: "1px solid #d4c9b0", background: "#faf6ef", overflow: "hidden",
      }}>
        {/* Cabeçalho da sidebar */}
        <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid #d4c9b0" }}>
          <h2 style={{ fontFamily: "'EB Garamond',serif", fontSize: 20, color: "#2b1e0f", marginBottom: 12 }}>
            Chat entre Clubes
          </h2>
          <button
            className="btn-confirmar"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 12 }}
            onClick={() => setModal(true)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nova conversa
          </button>
        </div>

        {/* Busca */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #d4c9b0" }}>
          <input
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            placeholder="Filtrar conversas…"
            style={{
              width: "100%", padding: "8px 12px", border: "1px solid #d4c9b0",
              borderRadius: 4, background: "#f2ede4", fontSize: 13, color: "#2b1e0f",
              fontFamily: "'Lato',sans-serif", outline: "none",
            }}
          />
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {carregando && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#9a8470" }}>
              Carregando…
            </div>
          )}
          {erroGlobal && (
            <div style={{ padding: 16, fontSize: 13, color: "#a0291f" }}>{erroGlobal}</div>
          )}
          {!carregando && listaFiltrada.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#9a8470" }}>
              Nenhuma conversa ainda.<br />Inicie uma nova conversa!
            </div>
          )}
          {listaFiltrada.map(c => {
            const isAtiva = ativa?.id === c.id;
            return (
              <div
                key={c.id}
                onClick={() => selecionarConversa(c)}
                style={{
                  padding: "13px 14px", borderBottom: "1px solid #d4c9b0",
                  cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start",
                  background: isAtiva ? "#ede4d4" : "transparent",
                  borderLeft: isAtiva ? "3px solid #c9a84c" : "3px solid transparent",
                  transition: "background .15s",
                }}
                onMouseEnter={e => { if (!isAtiva) e.currentTarget.style.background = "#f4ede0"; }}
                onMouseLeave={e => { if (!isAtiva) e.currentTarget.style.background = "transparent"; }}
              >
                <Avatar nome={c.outro_nome} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#2b1e0f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.outro_nome}
                      {c.nao_lidas > 0 && (
                        <span style={{
                          marginLeft: 6, background: "#eb8918", color: "#fff",
                          borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 6px",
                        }}>
                          {c.nao_lidas}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 10, color: "#9a8470", flexShrink: 0 }}>
                      {formatarHora(c.ultima_msg_em)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#7a5c2e", marginBottom: 2 }}>{c.outro_clube_nome}</div>
                  <div style={{ fontSize: 12, color: "#9a8470", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.ultima_msg ?? <em>Sem mensagens</em>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Área principal ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f2ede4" }}>

        {/* Estado vazio */}
        {!ativa && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 12, color: "#9a8470",
          }}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#7a5c2e" strokeWidth="1.3" opacity=".35">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h3 style={{ fontFamily: "'EB Garamond',serif", fontSize: 22, color: "#2b1e0f", opacity: .55 }}>
              Selecione uma conversa
            </h3>
            <p style={{ fontSize: 13 }}>Ou inicie uma nova conversa com membros de outro clube.</p>
          </div>
        )}

        {/* Header da conversa */}
        {ativa && (
          <div style={{
            padding: "14px 22px", background: "#faf6ef",
            borderBottom: "1px solid #d4c9b0", display: "flex", alignItems: "center", gap: 12,
          }}>
            <Avatar nome={ativa.outro_nome} size={40} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#2b1e0f" }}>{ativa.outro_nome}</div>
              <div style={{ fontSize: 11, color: "#9a8470", textTransform: "uppercase", letterSpacing: .5 }}>
                {ativa.outro_clube_nome}
              </div>
            </div>
          </div>
        )}

        {/* Mensagens */}
        {ativa && (
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
            {mensagens.length === 0 && (
              <div style={{ textAlign: "center", fontSize: 13, color: "#9a8470", marginTop: 32 }}>
                Nenhuma mensagem ainda. Diga olá! 👋
              </div>
            )}

            {(() => {
              let ultimaData = null;
              return mensagens.map((m) => {
                const dataMsg = m.enviado_em?.slice(0, 10) ?? "";
                const mostrarSep = dataMsg !== ultimaData;
                if (mostrarSep) ultimaData = dataMsg;

                return (
                  <div key={m.id}>
                    {mostrarSep && (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10,
                        fontSize: 11, color: "#9a8470", textTransform: "uppercase",
                        letterSpacing: .5, margin: "6px 0",
                      }}>
                        <div style={{ flex: 1, height: 1, background: "#d4c9b0" }} />
                        {formatarDataSep(dataMsg)}
                        <div style={{ flex: 1, height: 1, background: "#d4c9b0" }} />
                      </div>
                    )}

                    <div style={{
                      display: "flex", gap: 8, alignItems: "flex-end",
                      flexDirection: m.proprio ? "row-reverse" : "row",
                    }}>
                      <Avatar nome={m.remetente_nome} size={28} />
                      <div style={{ maxWidth: "65%", display: "flex", flexDirection: "column", gap: 2, alignItems: m.proprio ? "flex-end" : "flex-start" }}>
                        {!m.proprio && (
                          <span style={{ fontSize: 10, color: "#9a8470", padding: "0 6px", textTransform: "uppercase", letterSpacing: .4 }}>
                            {m.remetente_nome}
                          </span>
                        )}
                        <div style={{
                          padding: "10px 14px",
                          borderRadius: 16,
                          borderBottomRightRadius: m.proprio ? 4 : 16,
                          borderBottomLeftRadius: m.proprio ? 16 : 4,
                          fontSize: 14, lineHeight: 1.55, wordBreak: "break-word",
                          background: m.proprio ? "#554824" : "#eee8dc",
                          color: m.proprio ? "#f0e6d0" : "#2b1e0f",
                          border: m.proprio ? "none" : "1px solid #d4c9b0",
                        }}>
                          {m.conteudo}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#9a8470", padding: "0 4px", flexDirection: m.proprio ? "row-reverse" : "row" }}>
                          <span>{m.enviado_em?.slice(11, 16)}</span>
                          {m.proprio && m.lido && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
            <div ref={msgEndRef} />
          </div>
        )}

        {/* Input */}
        {ativa && (
          <div style={{
            padding: "12px 22px", background: "#faf6ef",
            borderTop: "1px solid #d4c9b0", display: "flex", gap: 10, alignItems: "flex-end",
          }}>
            <div style={{
              flex: 1, border: "1px solid #d4c9b0", borderRadius: 8,
              background: "#f2ede4", overflow: "hidden",
            }}>
              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                onKeyDown={teclaEnviar}
                placeholder="Digite sua mensagem…"
                rows={1}
                style={{
                  width: "100%", minHeight: 44, maxHeight: 120,
                  padding: "12px 14px", border: "none", background: "transparent",
                  fontFamily: "'Lato',sans-serif", fontSize: 14, color: "#2b1e0f",
                  resize: "none", outline: "none", overflowY: "auto",
                }}
                onInput={e => {
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
              />
            </div>
            <button
              className="btn-confirmar"
              onClick={enviar}
              disabled={enviando || !texto.trim()}
              style={{
                width: 44, height: 44, padding: 0,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
              title="Enviar (Enter)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && <ModalNovaConversa onIniciar={handleIniciar} onFechar={() => setModal(false)} />}
    </div>
  );
}
