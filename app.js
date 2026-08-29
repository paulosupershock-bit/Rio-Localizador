/* ==========================================================================
   RIO LOCALIZADOR - APP.JS (VERSÃO ATUALIZADA)
   Funcionalidades inclusas:
   - Cadastro simplificado apenas com Telefone (E-mail opcional)
   - Adição direta de contato com confirmação automática (Status: Accepted)
   - Visualização de Localização em Tempo Real e Histórico do Contato
   ========================================================================== */

// --- CONFIGURAÇÃO E INICIALIZAÇÃO DO FIREBASE ---
const db = firebase.database();
const auth = firebase.auth();

// --- ELEMENTOS DO DOM ---
const btnAdminRegisterUser = document.getElementById("btnAdminRegisterUser");
const contactsListElement = document.getElementById("contactsList");

// --- UTILS: FORMATAÇÃO DE TELEFONE ---
function formatPhoneNumber(phone) {
  let cleaned = ('' + phone).replace(/\D/g, '');
  if (!cleaned) return '';
  // Se não tiver código de país (+55 para Brasil), adiciona por padrão
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = '55' + cleaned;
  }
  return '+' + cleaned;
}

// ==========================================================================
// 1. CADASTRO DE CONTATO COM CONFIRMAÇÃO AUTOMÁTICA DE AMIZADE
// ==========================================================================
if (btnAdminRegisterUser) {
  btnAdminRegisterUser.addEventListener("click", async () => {
    // Solicita o Telefone (Obrigatório)
    const rawPhone = prompt("Digite o TELEFONE com DDD do contato (ex: 21999998888):");
    if (!rawPhone) {
      alert("Operação cancelada: Telefone não informado.");
      return;
    }

    const cleanedPhone = formatPhoneNumber(rawPhone);
    if (!cleanedPhone || cleanedPhone.length < 12) {
      alert("Por favor, digite um número de telefone válido com DDD.");
      return;
    }

    // Solicita o E-mail (Opcional)
    const optionalEmail = prompt("Digite o E-MAIL do contato (OPCIONAL - pode deixar em branco):") || "";
    const userEmail = optionalEmail.trim().toLowerCase();

    // Solicita o Nome de Exibição
    const displayName = prompt("Digite o NOME do contato para exibição:") || cleanedPhone;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        alert("Erro: Você precisa estar logado para cadastrar um contato.");
        return;
      }
      const myUid = currentUser.uid;

      // 1. Gera uma nova chave/ID único no nó 'users' do Realtime Database
      const newUserRef = db.ref('users').push();
      const newFriendUid = newUserRef.key;

      // 2. Prepara atualização em lote (atomic update)
      const updates = {};

      // Dados do Perfil do Novo Contato
      updates[`/users/${newFriendUid}`] = {
        uid: newFriendUid,
        phone: cleanedPhone,
        email: userEmail,
        displayName: displayName,
        isHistoryPrivate: false,
        createdManual: true,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        lastLocation: {
          latitude: 0,
          longitude: 0,
          timestamp: Date.now()
        }
      };

      // Establece Vínculo de Amizade Confirmada (Accepted) para ambos
      updates[`/friendships/${myUid}/${newFriendUid}`] = "accepted";
      updates[`/friendships/${newFriendUid}/${myUid}`] = "accepted";

      // 3. Grava no Firebase Realtime Database
      await db.ref().update(updates);

      alert(`✅ Contato cadastrado e vinculado com sucesso!\n\n` +
            `Nome: ${displayName}\n` +
            `Telefone: ${cleanedPhone}\n` +
            `Status: Amizade Confirmada Automática\n\n` +
            `O contato já está disponível na sua lista "MEUS CONTATOS".`);

      // Atualiza a interface
      loadContactsList();

    } catch (error) {
      console.error("Erro ao cadastrar contato:", error);
      alert("Erro ao cadastrar contato: " + error.message);
    }
  });
}

// ==========================================================================
// 2. CARREGAMENTO E EXIBIÇÃO DA LISTA DE CONTATOS (COM LOCALIZAÇÃO E HISTÓRICO)
// ==========================================================================
function loadContactsList() {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  const myUid = currentUser.uid;

  // Escuta os vínculos de amizade do usuário logado
  db.ref(`friendships/${myUid}`).on('value', async (snapshot) => {
    if (!contactsListElement) return;
    contactsListElement.innerHTML = '';

    const friendships = snapshot.val();
    if (!friendships) {
      contactsListElement.innerHTML = '<li class="empty">Nenhum contato adicionado.</li>';
      return;
    }

    // Para cada amigo com status 'accepted'
    for (const [friendUid, status] of Object.entries(friendships)) {
      if (status === 'accepted') {
        // Busca os dados do perfil do amigo
        const userSnap = await db.ref(`users/${friendUid}`).once('value');
        const friendData = userSnap.val();

        if (friendData) {
          renderContactCard(friendData);
        }
      }
    }
  });
}

// Renderiza o card do contato com ações para Ver Localização e Histórico
function renderContactCard(friendData) {
  const li = document.createElement("li");
  li.className = "contact-card";
  li.innerHTML = `
    <div class="contact-info">
      <strong>${friendData.displayName || 'Contato sem nome'}</strong>
      <span>${friendData.phone} ${friendData.email ? ' | ' + friendData.email : ''}</span>
    </div>
    <div class="contact-actions">
      <button onclick="viewLocation('${friendData.uid}')" class="btn-action btn-map">📍 Localização</button>
      <button onclick="viewHistory('${friendData.uid}')" class="btn-action btn-history">📜 Histórico</button>
    </div>
  `;
  contactsListElement.appendChild(li);
}

// ==========================================================================
// 3. VISUALIZAR LOCALIZAÇÃO EM TEMPO REAL E HISTÓRICO DO CONTATO
// ==========================================================================

// Visualizar Localização Atual no Mapa
window.viewLocation = function(friendUid) {
  db.ref(`users/${friendUid}/lastLocation`).once('value', (snapshot) => {
    const loc = snapshot.val();
    if (!loc || (loc.latitude === 0 && loc.longitude === 0)) {
      alert("Este contato ainda não possui coordenadas registradas no GPS.");
      return;
    }
    
    alert(`📍 Localização Atual do Contato:\nLat: ${loc.latitude}\nLng: ${loc.longitude}\nÚltima atualização: ${new Date(loc.timestamp).toLocaleString('pt-BR')}`);
    
    // Centraliza o mapa se a biblioteca (ex: Leaflet) estiver ativa
    if (typeof map !== 'undefined' && map.setView) {
      map.setView([loc.latitude, loc.longitude], 15);
      L.marker([loc.latitude, loc.longitude]).addTo(map)
        .bindPopup(`<b>Contato</b><br>Atualizado em: ${new Date(loc.timestamp).toLocaleTimeString('pt-BR')}`)
        .openPopup();
    }
  });
};

// Visualizar Histórico de Deslocamento
window.viewHistory = function(friendUid) {
  db.ref(`users/${friendUid}`).once('value', async (userSnap) => {
    const friendData = userSnap.val();
    if (friendData && friendData.isHistoryPrivate) {
      alert("🔒 Este contato configurou o histórico como privado.");
      return;
    }

    // Busca o histórico de localizações
    db.ref(`locations/${friendUid}`).limitToLast(20).once('value', (snapshot) => {
      const history = snapshot.val();
      if (!history) {
        alert("Nenhum histórico de localização encontrado para este contato.");
        return;
      }

      let historyText = "📜 Histórico de Localizações (Últimos Registros):\n\n";
      Object.values(history).forEach((item) => {
        const time = new Date(item.timestamp).toLocaleString('pt-BR');
        historyText += `• ${time}: Lat ${item.latitude}, Lng ${item.longitude}\n`;
      });

      alert(historyText);
    });
  });
};

// Autenticação / Inicialização ao carregar a página
auth.onAuthStateChanged((user) => {
  if (user) {
    loadContactsList();
  }
});