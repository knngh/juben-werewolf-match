function joinPlace(item) {
  return [item.city, item.area, item.address].filter(Boolean).join(' · ');
}

function statusText(status) {
  return {
    open: '开放中',
    closed: '已满员',
    cancelled: '已取消',
  }[status] || status || '';
}

function requestStatusText(status) {
  return {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
    withdrawn: '已撤回',
  }[status] || status || '';
}

function certaintyText(value) {
  return {
    confirmed: '确定参加',
    tentative: '待确认',
    chat_first: '想先沟通',
  }[value] || value || '';
}

function enrichSession(item) {
  const session = Object.assign({}, item);
  session.placeText = joinPlace(session) || session.city || '地点待定';
  session.statusText = statusText(session.status);
  session.requestStatusText = requestStatusText(session.requestStatus);
  session.certaintyText = certaintyText(session.requestCertainty);
  session.metaText = [
    session.gameType,
    session.playDate && session.playTime ? session.playDate + ' ' + session.playTime : '',
    session.playMode,
    session.budgetRange,
  ].filter(Boolean).join(' · ');
  session.seatText = (session.currentPlayers || 0) + '/' + (session.maxPlayers || 0) + ' 人';
  if (session.distanceKm !== undefined) {
    session.distanceText = session.distanceKm + 'km';
  }
  return session;
}

module.exports = {
  joinPlace,
  statusText,
  requestStatusText,
  certaintyText,
  enrichSession,
};
