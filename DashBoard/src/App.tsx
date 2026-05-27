// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";

import Dashboard from "./pages/dashboard.jsx";
import Receitas from "./pages/Receitas.jsx";
import Categorias from "./pages/Categorias.jsx";
import Cargos from "./pages/Cargos.jsx";
import UsuariosClube from "./pages/UsuariosClube.jsx";
import ProdutosPage from "./pages/produtos.jsx";
import MensalidadesPage from "./pages/Mensalidades.jsx";
import HistoricoPage from "./pages/Historico.jsx";
import Eventos from "./pages/Eventos.jsx";
import EventoEditar from "./pages/EventoEditar.jsx";
import EventoRelatorio from "./pages/EventoRelatorio.jsx";
import Relatorios from "./pages/Relatorios.jsx";
import GastosFixos from "./pages/GastosFixos.jsx";
import Chat from "./pages/Chat.jsx";
import { obterClubeAtual } from "./services/api";

type Secao =
  | "dashboard"
  | "movimentacoes"
  | "categorias"
  | "cargos"
  | "usuarios"
  | "produtos"
  | "mensalidades"
  | "eventos"
  | "evento-editar"
  | "evento-relatorio"
  | "historico"
  | "relatorios"
  | "gastos-fixos"
  | "chat";

function formatarMoeda(valor?: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function temPermissao(permissoes: any, permissao?: string | string[]) {
  if (!permissao) return true;
  const lista = Array.isArray(permissao) ? permissao : [permissao];
  return lista.some((chave) => Boolean(permissoes?.[chave]));
}

export default function App() {
  const [secaoAtiva, setSecaoAtiva] = useState<Secao>("dashboard");
  const [eventoSelecionadoId, setEventoSelecionadoId] = useState<number | null>(null);
  const [clube, setClube] = useState<any>(null);
  const [cargo, setCargo] = useState<any>(null);
  const [permissoes, setPermissoes] = useState<any>({});
  const [carregandoCaixa, setCarregandoCaixa] = useState(true);
  const [configAberta, setConfigAberta] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("skarbiec-dark-mode") === "true";
    } catch {
      return false;
    }
  });

  const carregarClube = useCallback(async () => {
    try {
      const resposta = await obterClubeAtual();
      setClube(resposta.clube || null);
      setCargo(resposta.cargo || null);
      setPermissoes(resposta.permissoes || {});
    } catch (error) {
      console.error("Erro ao carregar clube:", error);
    } finally {
      setCarregandoCaixa(false);
    }
  }, []);

  useEffect(() => {
    carregarClube();
  }, [carregarClube]);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
    try {
      localStorage.setItem("skarbiec-dark-mode", String(darkMode));
    } catch {
      // localStorage pode estar indisponível em algum ambiente de teste
    }
  }, [darkMode]);

  const permissoesPorSecao: Partial<Record<Secao, string | string[]>> = {
    movimentacoes: "perm_ver_movimentacoes",
    categorias: ["perm_editar_movimentacoes", "perm_gerenciar_cargos"],
    cargos: "perm_gerenciar_cargos",
    usuarios: "perm_aprovar_membros",
    produtos: "perm_ver_produtos",
    mensalidades: "perm_ver_mensalidades",
    eventos: "perm_ver_eventos",
    "evento-editar": "perm_editar_eventos",
    "evento-relatorio": ["perm_ver_eventos", "perm_ver_relatorios"],
    historico: "perm_ver_relatorios",
    relatorios: "perm_ver_relatorios",
    "gastos-fixos": "perm_ver_gastos_fixos",
  };

  const podeAcessarSecao = useCallback(
    (secao: Secao) => secao === "dashboard" || secao === "chat" || temPermissao(permissoes, permissoesPorSecao[secao]),
    [permissoes]
  );

  const navegarPara = useCallback(
    (secao: Secao) => {
      if (!podeAcessarSecao(secao)) {
        setEventoSelecionadoId(null);
        setSecaoAtiva("dashboard");
        return;
      }

      setEventoSelecionadoId(null);
      setSecaoAtiva(secao);
    },
    [podeAcessarSecao]
  );

  useEffect(() => {
    if (!carregandoCaixa && !podeAcessarSecao(secaoAtiva)) {
      setEventoSelecionadoId(null);
      setSecaoAtiva("dashboard");
    }
  }, [carregandoCaixa, podeAcessarSecao, secaoAtiva]);

  function abrirGerenciamentoEvento(eventoId: number) {
    if (!podeAcessarSecao("evento-editar")) return;
    setEventoSelecionadoId(eventoId);
    setSecaoAtiva("evento-editar");
  }

  function abrirRelatorioEvento(eventoId: number) {
    if (!podeAcessarSecao("evento-relatorio")) return;
    setEventoSelecionadoId(eventoId);
    setSecaoAtiva("evento-relatorio");
  }

  function voltarParaEventos() {
    setEventoSelecionadoId(null);
    setSecaoAtiva("eventos");
  }

  const pageProps = {
    onCaixaAtualizado: carregarClube,
    saldoAtual: Number(clube?.saldo_atual || 0),
    clube,
    cargo,
    permissoes,
  };

  function renderSecao() {
    if (!podeAcessarSecao(secaoAtiva)) {
      return <Dashboard onNavigate={navegarPara} saldoAtual={pageProps.saldoAtual} clube={clube} permissoes={permissoes} />;
    }

    switch (secaoAtiva) {
      case "dashboard":
        return <Dashboard onNavigate={navegarPara} saldoAtual={pageProps.saldoAtual} clube={clube} permissoes={permissoes} />;
      case "movimentacoes":
        return <Receitas {...pageProps} />;
      case "categorias":
        return <Categorias {...pageProps} />;
      case "cargos":
        return <Cargos {...pageProps} />;
      case "usuarios":
        return <UsuariosClube {...pageProps} />;
      case "produtos":
        return <ProdutosPage {...pageProps} />;
      case "mensalidades":
        return <MensalidadesPage {...pageProps} />;
      case "eventos":
        return (
          <Eventos
            {...pageProps}
            onOpenManage={abrirGerenciamentoEvento}
            onOpenReport={abrirRelatorioEvento}
          />
        );
      case "evento-editar":
        return eventoSelecionadoId ? (
          <EventoEditar
            eventoId={eventoSelecionadoId}
            onBack={voltarParaEventos}
            onOpenReport={abrirRelatorioEvento}
            onCaixaAtualizado={carregarClube}
          />
        ) : (
          <Eventos {...pageProps} onOpenManage={abrirGerenciamentoEvento} onOpenReport={abrirRelatorioEvento} />
        );
      case "evento-relatorio":
        return eventoSelecionadoId ? (
          <EventoRelatorio eventoId={eventoSelecionadoId} onBack={voltarParaEventos} />
        ) : (
          <Eventos {...pageProps} onOpenManage={abrirGerenciamentoEvento} onOpenReport={abrirRelatorioEvento} />
        );
      case "historico":
        return <HistoricoPage {...pageProps} />;
      case "chat":
        return <Chat />;
      case "relatorios":
        return <Relatorios {...pageProps} />;
      case "gastos-fixos":
        return <GastosFixos {...pageProps} />;
      default:
        return <Dashboard onNavigate={navegarPara} saldoAtual={pageProps.saldoAtual} clube={clube} permissoes={permissoes} />;
    }
  }

  const menuSections = useMemo(() => [
    {
      label: "Menu",
      items: [
        { chave: "dashboard", label: "Dashboard" },
        { chave: "movimentacoes", label: "Movimentações", permissao: "perm_ver_movimentacoes" },
        { chave: "mensalidades", label: "Mensalidades", permissao: "perm_ver_mensalidades" },
        { chave: "historico", label: "Histórico", permissao: "perm_ver_relatorios" },
        { chave: "chat", label: "Chat" },
        { chave: "relatorios", label: "Relatórios", permissao: "perm_ver_relatorios" },
      ],
    },
    {
      label: "Cadastros",
      items: [
        { chave: "produtos", label: "Produtos", permissao: "perm_ver_produtos" },
        { chave: "eventos", label: "Eventos", permissao: "perm_ver_eventos" },
        { chave: "gastos-fixos", label: "Gastos fixos", permissao: "perm_ver_gastos_fixos" },
      ],
    },
    {
      label: "Configurações",
      items: [
        { chave: "cargos", label: "Cargos", permissao: "perm_gerenciar_cargos" },
        { chave: "categorias", label: "Categorias", permissao: ["perm_editar_movimentacoes", "perm_gerenciar_cargos"] },
        { chave: "usuarios", label: "Usuários", permissao: "perm_aprovar_membros" },
      ],
    },
  ], []);

  const menuSectionsFiltradas = menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => temPermissao(permissoes, item.permissao)),
    }))
    .filter((section) => section.items.length > 0);

  const iniciaisClube = clube?.nome
    ? clube.nome
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((parte: string) => parte[0])
        .join("")
        .toUpperCase()
    : "SK";

  function sair() {
    window.location.href = "http://localhost/skarbiecKlubu/index.html";
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sb-logo">
          <strong>Skarbiec</strong>
          <span>Sistema</span>
        </div>

        <nav className="sb-nav">
          {menuSectionsFiltradas.map((section, index) => (
            <div className="sb-section" key={section.label}>
              <p className={`sb-label ${index > 0 ? "sb-label-spaced" : ""}`}>{section.label}</p>
              <ul>
                {section.items.map((item) => (
                  <li
                    key={item.chave}
                    className={`sb-item ${secaoAtiva === item.chave ? "active" : ""}`}
                    onClick={() => navegarPara(item.chave)}
                  >
                    <span className="sb-dot"></span>
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sb-footer">
          <div className="sb-footer-user">
            <div className="sb-avatar">{iniciaisClube}</div>
            <div className="sb-user-info">
              <strong>{clube?.nome || "Skarbiec"}</strong>
              <span>{cargo?.nome ? `Cargo: ${cargo.nome}` : clube?.cidade || "Clube atual"}</span>
            </div>
          </div>
          <button className="btn-logout" type="button" onClick={sair}>
            Sair
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar-caixa">
          <div>
            <strong>Caixa do clube</strong>
            <span>{clube?.nome ? `${clube.nome} • ${clube.cidade}` : "Clube atual"}</span>
          </div>
          <div className="topbar-actions">
            <div className="topbar-caixa-valor">
              {carregandoCaixa ? "Carregando..." : formatarMoeda(Number(clube?.saldo_atual || 0))}
            </div>

            <button
              className={`topbar-btn ${configAberta ? "active" : ""}`}
              type="button"
              aria-label="Abrir configurações"
              aria-expanded={configAberta}
              onClick={() => setConfigAberta((aberta) => !aberta)}
            >
              ⚙
            </button>

            <div className={`config-menu ${configAberta ? "ativo" : ""}`}>
              <div className="config-box">
                <h4>Configurações</h4>
                <div className="config-item">
                  <span>Modo escuro</span>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={darkMode}
                      onChange={(event) => setDarkMode(event.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {renderSecao()}
      </div>
    </div>
  );
}
