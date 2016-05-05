using Microsoft.Owin;
using Owin;

namespace ESP
{
    public class Startup
    {
        public void Configuration(IAppBuilder app)
        {
            app.MapSignalR();
        }
    }
}