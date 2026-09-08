/*
 * A small client-side-routed support console. Route changes swap the contents of <main>
 * and announce nothing, which is the failure most single-page apps ship with. Loading
 * the page with ?announce=on turns on the correct behavior instead: focus moves to the
 * new view's heading and a role="status" region names the view.
 */
const KNOWN_EMAIL = 'dana@northwind.test';
const KNOWN_PASSWORD = 'correct horse';

const TICKETS = {
   4821: { title: 'Cannot export a report', customer: 'Bergen Foods', priority: 'high' },
   4822: { title: 'Seat count is wrong', customer: 'Lindwall Group', priority: 'normal' },
   4823: {
      title: 'Invite email never arrived',
      customer: 'Okonjo Labs',
      priority: 'normal',
   },
};

const announceRoutes =
   new URLSearchParams(globalThis.location.search).get('announce') === 'on';
const chrome = document.querySelector('#chrome');
const routeStatus = document.querySelector('#route-status');
const view = document.querySelector('#view');
const escalateBackdrop = document.querySelector('#escalate-backdrop');

let signedInUser = '';

function render(templateId) {
   const template = document.querySelector(`#${templateId}`);

   view.replaceChildren(template.content.cloneNode(true));
}

function announceView(name) {
   if (!announceRoutes) {
      return;
   }
   routeStatus.hidden = false;
   routeStatus.textContent = `${name} view`;
   view.querySelector('h1')?.focus();
}

function renderSignIn() {
   render('view-signin');
   chrome.hidden = true;
   document.querySelector('#signin-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);

      if (
         String(data.get('email') ?? '') !== KNOWN_EMAIL ||
         String(data.get('password') ?? '') !== KNOWN_PASSWORD
      ) {
         // The message goes to a plain paragraph, not linked to the field and not a region.
         document.querySelector('#signin-error').textContent =
            'That email and password do not match an account.';
         document.querySelector('#password').value = '';
         return;
      }
      signedInUser = String(data.get('email'));
      globalThis.location.hash = '#/queue';
   });
   announceView('Sign in');
}

function ticketRow(id, ticket) {
   const row = document.createElement('tr');

   row.dataset.priority = ticket.priority;
   row.innerHTML =
      `<td><a href="#/ticket/${id}">${ticket.title}</a></td>` +
      `<td>${ticket.customer}</td>` +
      `<td>${ticket.priority === 'high' ? 'High' : 'Normal'}</td>`;
   return row;
}

function renderQueue() {
   render('view-queue');
   chrome.hidden = false;
   const rows = Object.entries(TICKETS).map(([id, ticket]) => ticketRow(id, ticket));

   document.querySelector('#ticket-rows').replaceChildren(...rows);
   document.querySelector('#filters').addEventListener('submit', (event) => {
      event.preventDefault();
      const query = document.querySelector('#q').value.trim().toLowerCase();
      const priority = document.querySelector('#priority').value;
      let shown = 0;

      for (const row of rows) {
         const matchesPriority = priority === 'all' || row.dataset.priority === priority;
         const matchesQuery =
            query === '' || row.textContent.toLowerCase().includes(query);

         row.hidden = !(matchesPriority && matchesQuery);
         shown += row.hidden ? 0 : 1;
      }
      // The count goes to a plain paragraph, so it never reaches a screen reader.
      document.querySelector('#result-count').textContent =
         `${shown} ${shown === 1 ? 'ticket' : 'tickets'}`;
   });
   announceView('Ticket queue');
}

function sendReply() {
   const body = document.querySelector('#reply-body');
   const replyStatus = document.querySelector('#reply-status');

   if (body.value.trim() === '') {
      replyStatus.textContent = 'Write a message before sending the reply.';
      return;
   }
   const state = document.querySelector('#reply-state');

   replyStatus.textContent = `Reply sent. Status is now ${state.selectedOptions[0].textContent}.`;
   body.value = '';
}

function renderTicket(id) {
   const ticket = TICKETS[id];

   if (!ticket) {
      globalThis.location.hash = '#/queue';
      return;
   }
   render('view-ticket');
   chrome.hidden = false;
   document.title = `${ticket.title} | Support console`;
   document.querySelector('#ticket-title').textContent = ticket.title;
   document.querySelector('#ticket-customer').textContent = ticket.customer;
   document.querySelector('#reply-form').addEventListener('submit', (event) => {
      event.preventDefault();
      sendReply();
   });
   // The dialog opens without moving focus into it and without listening for Escape.
   document.querySelector('#open-escalate').addEventListener('click', () => {
      escalateBackdrop.hidden = false;
   });
   announceView(ticket.title);
}

function renderSettings() {
   render('view-settings');
   chrome.hidden = false;
   const field = document.querySelector('#display-name');
   const fieldError = document.querySelector('#display-name-error');

   document.querySelector('#profile-form').addEventListener('submit', (event) => {
      event.preventDefault();
      document.querySelector('#profile-status').textContent = '';
      if (field.value.trim() === '') {
         fieldError.textContent = 'Display name cannot be empty.';
         fieldError.hidden = false;
         field.setAttribute('aria-invalid', 'true');
         field.setAttribute('aria-describedby', 'display-name-error');
         field.focus();
         return;
      }
      fieldError.hidden = true;
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
      document.querySelector('#profile-status').textContent = 'Profile saved.';
   });
   announceView('Your profile');
}

function routeTo(hash) {
   if (!signedInUser) {
      renderSignIn();
      return;
   }
   const ticketMatch = /^#\/ticket\/(?<id>\d+)$/u.exec(hash);

   if (ticketMatch) {
      renderTicket(ticketMatch.groups.id);
      return;
   }
   if (hash === '#/settings') {
      renderSettings();
      return;
   }
   renderQueue();
}

document.querySelector('#sign-out').addEventListener('click', () => {
   signedInUser = '';
   globalThis.location.hash = '#/signin';
   renderSignIn();
});

document.querySelector('#cancel-escalate').addEventListener('click', () => {
   escalateBackdrop.hidden = true;
});

document.querySelector('#confirm-escalate').addEventListener('click', () => {
   escalateBackdrop.hidden = true;
   document.querySelector('#reply-status').textContent =
      'Ticket escalated to the on-call engineer.';
});

globalThis.addEventListener('hashchange', () => {
   routeTo(globalThis.location.hash);
});

routeTo(globalThis.location.hash);
