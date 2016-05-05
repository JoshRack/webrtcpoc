using Microsoft.AspNet.SignalR;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

namespace ESP
{
    public class WebRtcHub : Hub
    {
        public void SendSdp(string message)
        {
            Clients.Others.sdpMessage(message);
        }

        public void SendAnswer(string message)
        {
            Clients.Others.answerMessage(message);
        }

        public void SendCandidate(string message)
        {
            Clients.Others.candidateMessage(message);
        }

        public void SendFinal(string message)
        {
            Clients.Others.finalMessage(message);
        }
    }
}